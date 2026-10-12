-- Forward correction: also redact reviewer-authored moderation notes on deletion.
-- Replaces only the transactional cleanup function; no data is changed by this migration.
BEGIN;

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
  SET reporter_id = CASE WHEN r.reporter_id=v_user_id THEN NULL ELSE r.reporter_id END,
      reported_user_id = CASE WHEN r.reported_user_id=v_user_id THEN NULL ELSE r.reported_user_id END,
      target_author_id = CASE WHEN r.target_author_id=v_user_id THEN NULL ELSE r.target_author_id END,
      details = CASE WHEN r.reporter_id=v_user_id OR r.reported_user_id=v_user_id OR r.target_author_id=v_user_id THEN NULL ELSE r.details END,
      target_excerpt = CASE WHEN r.reported_user_id=v_user_id OR r.target_author_id=v_user_id THEN '' ELSE r.target_excerpt END,
      target_media_urls = CASE WHEN r.reported_user_id=v_user_id OR r.target_author_id=v_user_id THEN '{}'::text[] ELSE r.target_media_urls END,
      moderator_notes = CASE WHEN r.reported_user_id=v_user_id OR r.target_author_id=v_user_id OR r.reviewed_by=v_user_id THEN NULL ELSE r.moderator_notes END,
      deletion_anonymized_at = now(),
      retention_expires_at = now()+interval '180 days'
  WHERE r.reporter_id=v_user_id OR r.reported_user_id=v_user_id OR r.target_author_id=v_user_id OR r.reviewed_by=v_user_id;

  UPDATE public.marketplace_reports r
  SET reporter_id = CASE WHEN r.reporter_id=v_user_id THEN NULL ELSE r.reporter_id END,
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

  -- Remove the account's own listings (all statuses), authored content, reactions,
  -- relationship edges, private notifications, read state, devices and queue data.
  -- Reports were redacted first so ON DELETE RESTRICT reporter FKs cannot block removal.
  DELETE FROM public.marketplace_listings WHERE seller_id=v_user_id;
  DELETE FROM public.comments WHERE author_id=v_user_id;
  DELETE FROM public.posts WHERE author_id=v_user_id;
  DELETE FROM public.likes WHERE user_id=v_user_id;
  DELETE FROM public.post_views WHERE viewer_id=v_user_id;
  DELETE FROM public.follows WHERE follower_id=v_user_id OR following_id=v_user_id;
  DELETE FROM public.blocked_users WHERE blocker_id=v_user_id OR blocked_id=v_user_id;
  DELETE FROM public.hidden_posts WHERE user_id=v_user_id;
  DELETE FROM public.push_notification_queue q
    WHERE q.recipient_id=v_user_id
       OR q.latest_notification_id IN (
         SELECT n.id FROM public.notifications n
         WHERE n.actor_id=v_user_id OR n.recipient_id=v_user_id
       );
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

COMMIT;
