-- Coordinated, retryable account deletion and finite moderation-report retention.
-- This migration changes schema/functions only. It does not delete any user's data.
BEGIN;

-- Reports filed by, about, or targeting a departing user may outlive that account
-- for a short moderation window, with identifying fields removed by the deletion RPC.
ALTER TABLE public.content_reports
  ALTER COLUMN reporter_id DROP NOT NULL,
  ALTER COLUMN target_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS deletion_anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

ALTER TABLE public.marketplace_reports
  ALTER COLUMN reporter_id DROP NOT NULL,
  ALTER COLUMN listing_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS deletion_anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_reporter_id_fkey;
ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.marketplace_reports
  DROP CONSTRAINT IF EXISTS marketplace_reports_reporter_id_fkey;
ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_reports_deletion_retention_idx
  ON public.content_reports(retention_expires_at)
  WHERE deletion_anonymized_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_reports_deletion_retention_idx
  ON public.marketplace_reports(retention_expires_at)
  WHERE deletion_anonymized_at IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text NOT NULL DEFAULT 'database_cleanup'
    CHECK (status IN ('database_cleanup','storage_cleanup','auth_delete_pending','complete','disabled_anonymized')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  recovery_deadline timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at timestamptz,
  last_error_code text,
  CONSTRAINT account_deletion_completed_identity_cleared
    CHECK (status <> 'complete' OR user_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_active_job_per_user
  ON private.account_deletion_jobs(user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS private.account_deletion_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_job_id uuid REFERENCES private.account_deletion_jobs(id) ON DELETE SET NULL,
  bucket_id text NOT NULL CHECK (bucket_id IN ('avatars','post-media','marketplace-images')),
  object_path text NOT NULL,
  public_url text NOT NULL,
  status text NOT NULL DEFAULT 'shared_retained'
    CHECK (status IN ('shared_retained','pending','deleted')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket_id, object_path)
);
CREATE INDEX IF NOT EXISTS account_deletion_media_due_idx
  ON private.account_deletion_media(next_attempt_at)
  WHERE status IN ('shared_retained','pending');

ALTER TABLE private.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.account_deletion_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.account_deletion_jobs, private.account_deletion_media FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.account_deletion_jobs, private.account_deletion_media TO service_role;

-- Every public RPC used by the Edge Function is service-role-only. The function
-- derives user_id from auth.getUser(access_token); no RPC is available to clients.
CREATE OR REPLACE FUNCTION public.begin_account_deletion(p_user_id uuid)
RETURNS TABLE(job_id uuid, status text, acquired boolean, recovery_deadline timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job private.account_deletion_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_user_id) THEN
    RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 20261012)
  );

  SELECT j.* INTO v_job
  FROM private.account_deletion_jobs j
  WHERE j.user_id=p_user_id
  ORDER BY j.requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_job.locked_until IS NOT NULL AND v_job.locked_until > now() THEN
      RETURN QUERY SELECT v_job.id, v_job.status, false, v_job.recovery_deadline;
      RETURN;
    END IF;
    UPDATE private.account_deletion_jobs
    SET locked_until=now()+interval '10 minutes', updated_at=now()
    WHERE id=v_job.id
    RETURNING * INTO v_job;
    RETURN QUERY SELECT v_job.id, v_job.status, true, v_job.recovery_deadline;
    RETURN;
  END IF;

  INSERT INTO private.account_deletion_jobs(user_id,status,locked_until)
  VALUES(p_user_id,'database_cleanup',now()+interval '10 minutes')
  RETURNING * INTO v_job;
  RETURN QUERY SELECT v_job.id, v_job.status, true, v_job.recovery_deadline;
END
$function$;

CREATE OR REPLACE FUNCTION public.apply_account_deletion_database_cleanup(p_job_id uuid)
RETURNS TABLE(next_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job private.account_deletion_jobs%ROWTYPE;
  v_user_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT j.* INTO v_job
  FROM private.account_deletion_jobs j
  WHERE j.id=p_job_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.user_id IS NULL THEN
    RAISE EXCEPTION 'Deletion job unavailable' USING ERRCODE = '22023';
  END IF;

  IF v_job.status IN ('storage_cleanup','auth_delete_pending','complete','disabled_anonymized') THEN
    RETURN QUERY SELECT v_job.status;
    RETURN;
  END IF;
  IF v_job.status <> 'database_cleanup' THEN
    RAISE EXCEPTION 'Deletion job phase conflict' USING ERRCODE = '55000';
  END IF;

  v_user_id := v_job.user_id;

  -- Preserve only finite, anonymized moderation evidence. Reports filed by the
  -- departing account about other accounts retain target evidence, but reporter
  -- details are removed. Reports targeting the departing account lose excerpts,
  -- media URLs, free text, and account-linked actor IDs.
  UPDATE public.content_reports r
  SET target_id = CASE WHEN r.target_type='profile' AND r.target_id=v_user_id THEN NULL ELSE r.target_id END,
      reporter_id = CASE WHEN r.reporter_id=v_user_id THEN NULL ELSE r.reporter_id END,
      reported_user_id = CASE WHEN r.reported_user_id=v_user_id THEN NULL ELSE r.reported_user_id END,
      target_author_id = CASE WHEN r.target_author_id=v_user_id THEN NULL ELSE r.target_author_id END,
      details = CASE WHEN r.reporter_id=v_user_id OR r.reported_user_id=v_user_id OR r.target_author_id=v_user_id
                          OR (r.target_type='profile' AND r.target_id=v_user_id) THEN NULL ELSE r.details END,
      target_excerpt = CASE WHEN r.reported_user_id=v_user_id OR r.target_author_id=v_user_id
                                  OR (r.target_type='profile' AND r.target_id=v_user_id) THEN '' ELSE r.target_excerpt END,
      target_media_urls = CASE WHEN r.reported_user_id=v_user_id OR r.target_author_id=v_user_id
                                      OR (r.target_type='profile' AND r.target_id=v_user_id) THEN '{}'::text[] ELSE r.target_media_urls END,
      moderator_notes = CASE WHEN r.reported_user_id=v_user_id OR r.target_author_id=v_user_id OR r.reviewed_by=v_user_id
                                   OR (r.target_type='profile' AND r.target_id=v_user_id) THEN NULL ELSE r.moderator_notes END,
      deletion_anonymized_at = now(),
      retention_expires_at = now()+interval '180 days'
  WHERE r.reporter_id=v_user_id OR r.reported_user_id=v_user_id OR r.target_author_id=v_user_id
     OR r.reviewed_by=v_user_id OR (r.target_type='profile' AND r.target_id=v_user_id);

  UPDATE public.marketplace_reports r
  SET listing_id = CASE WHEN EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=r.listing_id AND l.seller_id=v_user_id)
                        THEN NULL ELSE r.listing_id END,
      reporter_id = CASE WHEN r.reporter_id=v_user_id THEN NULL ELSE r.reporter_id END,
      reported_user_id = CASE WHEN r.reported_user_id=v_user_id THEN NULL ELSE r.reported_user_id END,
      details = CASE WHEN r.reporter_id=v_user_id OR r.reported_user_id=v_user_id
                     OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=r.listing_id AND l.seller_id=v_user_id)
                THEN NULL ELSE r.details END,
      target_excerpt = CASE WHEN r.reported_user_id=v_user_id
                       OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=r.listing_id AND l.seller_id=v_user_id)
                       THEN '' ELSE r.target_excerpt END,
      target_image_url = CASE WHEN r.reported_user_id=v_user_id
                         OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=r.listing_id AND l.seller_id=v_user_id)
                         THEN NULL ELSE r.target_image_url END,
      moderator_notes = CASE WHEN r.reported_user_id=v_user_id OR r.reviewed_by=v_user_id
                         OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=r.listing_id AND l.seller_id=v_user_id)
                         THEN NULL ELSE r.moderator_notes END,
      deletion_anonymized_at = now(),
      retention_expires_at = now()+interval '180 days'
  WHERE r.reporter_id=v_user_id
     OR r.reported_user_id=v_user_id
     OR r.reviewed_by=v_user_id
     OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id=r.listing_id AND l.seller_id=v_user_id);

  -- Remove pending push batches affected by the departing account, its posts,
  -- or a comment thread containing one of its replies before cascade deletions remove
  -- the notification rows used to identify those batches.
  DELETE FROM public.push_notification_queue q
  WHERE q.recipient_id=v_user_id
     OR q.latest_notification_id IN (
       SELECT n.id FROM public.notifications n
       WHERE n.actor_id=v_user_id
          OR n.recipient_id=v_user_id
          OR n.post_id IN (SELECT p.id FROM public.posts p WHERE p.author_id=v_user_id)
          OR n.comment_id IN (
            SELECT c.id FROM public.comments c
            WHERE c.author_id=v_user_id
               OR c.post_id IN (SELECT p.id FROM public.posts p WHERE p.author_id=v_user_id)
          )
          OR n.source_id IN (
            SELECT c.id FROM public.comments c
            WHERE c.author_id=v_user_id
               OR c.post_id IN (SELECT p.id FROM public.posts p WHERE p.author_id=v_user_id)
          )
          OR n.thread_id IN (
            SELECT impacted.thread_id
            FROM public.notifications impacted
            WHERE impacted.actor_id=v_user_id AND impacted.thread_id IS NOT NULL
          )
     );

  -- Remove the account's own listings (all statuses), authored content, reactions,
  -- relationship edges, private notifications, read state, and device subscriptions.
  -- The queue phase above avoids stale batches for deleted posts/comments.
  DELETE FROM public.marketplace_listings WHERE seller_id=v_user_id;
  DELETE FROM public.comments WHERE author_id=v_user_id;
  DELETE FROM public.posts WHERE author_id=v_user_id;
  DELETE FROM public.likes WHERE user_id=v_user_id;
  DELETE FROM public.post_views WHERE viewer_id=v_user_id;
  DELETE FROM public.follows WHERE follower_id=v_user_id OR following_id=v_user_id;
  DELETE FROM public.blocked_users WHERE blocker_id=v_user_id OR blocked_id=v_user_id;
  DELETE FROM public.hidden_posts WHERE user_id=v_user_id;
  DELETE FROM public.push_delivery_receipts r
    WHERE r.subscription_id IN (SELECT s.id FROM public.push_subscriptions s WHERE s.user_id=v_user_id);
  DELETE FROM public.push_subscriptions WHERE user_id=v_user_id;
  DELETE FROM public.notifications WHERE recipient_id=v_user_id OR actor_id=v_user_id;
  DELETE FROM public.profiles WHERE id=v_user_id;

  UPDATE private.account_deletion_jobs
  SET status='storage_cleanup',
      locked_until=now()+interval '10 minutes',
      updated_at=now(),
      last_error_code=NULL
  WHERE id=p_job_id;

  RETURN QUERY SELECT 'storage_cleanup'::text;
END
$function$;

CREATE OR REPLACE FUNCTION public.mark_account_deletion_auth_pending(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  UPDATE private.account_deletion_jobs
  SET status='auth_delete_pending',
      locked_until=now()+interval '10 minutes',
      updated_at=now(),
      last_error_code=NULL
  WHERE id=p_job_id AND user_id IS NOT NULL
    AND status IN ('storage_cleanup','auth_delete_pending');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows=1;
END
$function$;

CREATE OR REPLACE FUNCTION public.complete_account_deletion(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  UPDATE private.account_deletion_jobs
  SET status='complete', user_id=NULL, locked_until=NULL,
      completed_at=now(), updated_at=now(), last_error_code=NULL
  WHERE id=p_job_id AND status='auth_delete_pending' AND user_id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows=1;
END
$function$;

CREATE OR REPLACE FUNCTION public.mark_account_deletion_disabled(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  UPDATE private.account_deletion_jobs
  SET status='disabled_anonymized', user_id=NULL, locked_until=NULL,
      completed_at=now(), updated_at=now(), last_error_code='auth_soft_deleted_after_retry_limit'
  WHERE id=p_job_id AND status='auth_delete_pending' AND user_id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows=1;
END
$function$;

CREATE OR REPLACE FUNCTION public.record_account_deletion_error(p_job_id uuid, p_error_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_error_code NOT IN ('database_cleanup_failed','storage_cleanup_failed','auth_delete_failed','auth_disable_failed','retry_worker_failed') THEN
    p_error_code := 'retry_worker_failed';
  END IF;
  UPDATE private.account_deletion_jobs
  SET attempt_count=attempt_count+1, locked_until=now()+interval '4 minutes',
      updated_at=now(), last_error_code=p_error_code
  WHERE id=p_job_id AND user_id IS NOT NULL AND status <> 'complete';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows=1;
END
$function$;

CREATE OR REPLACE FUNCTION public.claim_account_deletion_jobs(p_limit integer DEFAULT 10)
RETURNS TABLE(job_id uuid,user_id uuid,status text,attempt_count integer,recovery_deadline timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM private.account_deletion_jobs j
    WHERE j.user_id IS NOT NULL
      AND j.status IN ('database_cleanup','storage_cleanup','auth_delete_pending')
      AND (j.locked_until IS NULL OR j.locked_until <= now())
    ORDER BY j.requested_at
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit,10),1),25)
  ), claimed AS (
    UPDATE private.account_deletion_jobs j
    SET locked_until=now()+interval '10 minutes',
        attempt_count=j.attempt_count+1, updated_at=now()
    FROM due
    WHERE j.id=due.id
    RETURNING j.id,j.user_id,j.status,j.attempt_count,j.recovery_deadline
  )
  SELECT * FROM claimed;
END
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_account_deletion_media(
  p_job_id uuid,p_bucket_id text,p_object_path text,p_public_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_bucket_id NOT IN ('avatars','post-media','marketplace-images')
     OR p_object_path IS NULL OR length(p_object_path)>1024
     OR p_public_url IS NULL OR length(p_public_url)>4096
     OR p_object_path LIKE '../%' OR p_object_path LIKE '%/../%' THEN
    RAISE EXCEPTION 'Invalid media cleanup request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO private.account_deletion_media(source_job_id,bucket_id,object_path,public_url)
  VALUES(p_job_id,p_bucket_id,p_object_path,p_public_url)
  ON CONFLICT(bucket_id,object_path) DO UPDATE
    SET source_job_id=coalesce(private.account_deletion_media.source_job_id,excluded.source_job_id),
        status=CASE WHEN private.account_deletion_media.status='deleted' THEN 'deleted' ELSE 'shared_retained' END,
        expires_at=least(private.account_deletion_media.expires_at,excluded.expires_at),
        updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_media_is_referenced(p_bucket_id text,p_object_path text,p_public_url text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  RETURN
    EXISTS(SELECT 1 FROM public.profiles p WHERE p.avatar_url=p_public_url)
    OR EXISTS(SELECT 1 FROM public.posts p WHERE p.media_urls @> ARRAY[p_public_url]::text[])
    OR EXISTS(SELECT 1 FROM public.marketplace_listings l WHERE l.images @> ARRAY[p_public_url]::text[] OR l.image_path=p_object_path)
    OR EXISTS(SELECT 1 FROM public.marketplace_reports r WHERE r.target_image_url=p_public_url)
    OR EXISTS(SELECT 1 FROM public.content_reports r WHERE r.target_media_urls @> ARRAY[p_public_url]::text[]);
END
$function$;

CREATE OR REPLACE FUNCTION public.claim_account_deletion_media(p_limit integer DEFAULT 50)
RETURNS TABLE(media_id uuid,bucket_id text,object_path text,public_url text,attempts integer,expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT m.id
    FROM private.account_deletion_media m
    WHERE m.status IN ('shared_retained','pending')
      AND (m.locked_until IS NULL OR m.locked_until<=now())
      AND m.next_attempt_at<=now()
    ORDER BY m.next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit,50),1),100)
  ), claimed AS (
    UPDATE private.account_deletion_media m
    SET locked_until=now()+interval '10 minutes',
        attempts=m.attempts+1,updated_at=now()
    FROM due
    WHERE m.id=due.id
    RETURNING m.id,m.bucket_id,m.object_path,m.public_url,m.attempts,m.expires_at
  )
  SELECT * FROM claimed;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_account_deletion_media_state(p_media_id uuid,p_state text,p_error_code text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_state NOT IN ('shared_retained','pending','deleted') THEN
    RAISE EXCEPTION 'Invalid media state' USING ERRCODE = '22023';
  END IF;
  UPDATE private.account_deletion_media
  SET status=p_state,
      attempts=CASE WHEN p_error_code IS NULL THEN attempts ELSE attempts+1 END,
      last_error_code=CASE WHEN p_error_code IS NULL THEN NULL ELSE 'storage_remove_failed' END,
      locked_until=NULL,
      next_attempt_at=CASE WHEN p_state='deleted' THEN now()
        WHEN p_error_code IS NOT NULL THEN now()+interval '5 minutes'
        WHEN expires_at <= now() THEN now()+interval '1 day'
        ELSE least(now()+interval '1 day',expires_at) END,
      updated_at=now()
  WHERE id=p_media_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows=1;
END
$function$;

CREATE OR REPLACE FUNCTION public.authorize_account_deletion_worker(p_supplied_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_secret text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name='campus_connect_account_deletion_worker_secret';
  RETURN v_secret IS NOT NULL
    AND p_supplied_secret IS NOT NULL
    AND length(p_supplied_secret)>=32
    AND v_secret=p_supplied_secret;
END
$function$;

CREATE OR REPLACE FUNCTION public.purge_expired_account_deletion_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_count integer; v_purged integer;
BEGIN
  -- Intended only for the database scheduler; it retains no user-facing path.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.content_reports
  WHERE deletion_anonymized_at IS NOT NULL AND retention_expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM public.marketplace_reports
  WHERE deletion_anonymized_at IS NOT NULL AND retention_expires_at <= now();
  GET DIAGNOSTICS v_purged = ROW_COUNT;
  v_count := v_count + v_purged;
  RETURN v_count;
END
$function$;

REVOKE ALL ON FUNCTION public.begin_account_deletion(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apply_account_deletion_database_cleanup(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_account_deletion_auth_pending(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_account_deletion_disabled(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_account_deletion_error(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletion_jobs(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_account_deletion_media(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_media_is_referenced(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletion_media(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_account_deletion_media_state(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_worker(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_account_deletion_reports() FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.begin_account_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_account_deletion_database_cleanup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_account_deletion_auth_pending(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_account_deletion_disabled(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_account_deletion_error(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_account_deletion_media(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_media_is_referenced(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_media(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_account_deletion_media_state(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_account_deletion_worker(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_account_deletion_reports() TO service_role;

CREATE OR REPLACE FUNCTION public.run_account_deletion_retention_maintenance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_purged integer;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  v_purged := public.purge_expired_account_deletion_reports();
  DELETE FROM private.account_deletion_jobs
  WHERE status IN ('complete','disabled_anonymized')
    AND user_id IS NULL
    AND updated_at < now()-interval '30 days';
  -- Never discard a queue record while the object may still exist. Only metadata
  -- for objects confirmed removed can expire after the finite 30-day audit window.
  DELETE FROM private.account_deletion_media
  WHERE status='deleted' AND updated_at < now()-interval '30 days';
  RETURN v_purged;
END
$function$;
REVOKE ALL ON FUNCTION public.run_account_deletion_retention_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_account_deletion_retention_maintenance() TO service_role;

-- Access tokens are stateless JWTs. Deleting auth.users removes refresh sessions,
-- but an already-issued access token can survive until its expiry. A restrictive
-- active-profile policy prevents a deleted account from continuing authenticated
-- table or Storage access during that residual JWT window.
CREATE OR REPLACE FUNCTION public.is_active_campus_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid())
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM private.account_deletion_jobs j
       WHERE j.user_id=auth.uid()
         AND j.status NOT IN ('complete','disabled_anonymized')
     );
$function$;
REVOKE ALL ON FUNCTION public.is_active_campus_account() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_campus_account() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.can_create_campus_profile()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM private.account_deletion_jobs j
       WHERE j.user_id=auth.uid()
     );
$function$;
REVOKE ALL ON FUNCTION public.can_create_campus_profile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_campus_profile() TO authenticated,service_role;

-- A restrictive active-account policy cannot be placed on profiles itself,
-- because new users need to create their first profile. Instead, the existing
-- owner-only insert policy also verifies a live Auth record and no deletion job.
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id=(SELECT auth.uid())
    AND public.can_create_campus_profile()
  );

DO $active_account_policies$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts','comments','likes','follows','notifications',
    'marketplace_listings','marketplace_reports','content_reports',
    'blocked_users','hidden_posts','post_views','push_notification_queue',
    'push_subscriptions','push_delivery_receipts','notification_preferences'
  ]
  LOOP
    IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
      EXECUTE format('DROP POLICY IF EXISTS active_campus_account_required ON public.%I',t);
      EXECUTE format(
        'CREATE POLICY active_campus_account_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_active_campus_account()) WITH CHECK (public.is_active_campus_account())',
        t
      );
    END IF;
  END LOOP;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS active_campus_account_required ON storage.objects';
    EXECUTE 'CREATE POLICY active_campus_account_required ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_active_campus_account()) WITH CHECK (public.is_active_campus_account())';
  END IF;
END
$active_account_policies$;

-- Generate a separate recovery credential once, in Vault. It is never emitted by this migration.
DO $vault_secret$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='campus_connect_account_deletion_worker_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'campus_connect_account_deletion_worker_secret',
      'Private credential for scheduled account-deletion recovery'
    );
  END IF;
END
$vault_secret$;

-- The actual auth.admin.deleteUser and Storage API operations run in the Edge Function.
-- These jobs call that function with a Vault-backed worker secret; user data is untouched
-- unless the user has explicitly requested deletion through the authenticated endpoint.
SELECT cron.schedule(
  'campus-connect-account-deletion-recovery',
  '*/5 * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='campus_connect_project_url')
             || '/functions/v1/delete-account',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='campus_connect_anon_jwt'),
        'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='campus_connect_anon_jwt'),
        'x-account-deletion-worker-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='campus_connect_account_deletion_worker_secret')
      ),
      body := '{"mode":"retry"}'::jsonb,
      timeout_milliseconds := 10000
    ) AS request_id;
  $job$
);

SELECT cron.schedule(
  'campus-connect-account-deletion-retention',
  '0 3 * * *',
  $job$
    SELECT public.run_account_deletion_retention_maintenance();
  $job$
);

COMMIT;
