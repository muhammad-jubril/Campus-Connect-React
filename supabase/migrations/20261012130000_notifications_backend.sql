-- Campus Connect Notifications backend.
-- Forward-only: preserves existing notification rows and app data.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comments'::regclass
      AND conname = 'comments_parent_comment_id_fkey'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_parent_comment_id_fkey
      FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS comments_parent_comment_id_created_at_idx
  ON public.comments (parent_comment_id, created_at DESC)
  WHERE parent_comment_id IS NOT NULL;

-- A new ID per like row lets a later unlike/re-like be a new activity event.
ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS activity_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS likes_activity_id_uidx ON public.likes (activity_id);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS comment_id uuid,
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS profile_id uuid;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END
$$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN ('like', 'comment', 'reply', 'follow'));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_activity_once_uidx
  ON public.notifications (recipient_id, type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id, created_at DESC) WHERE read = false;

-- No follow relationship table existed in the live database.
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> followed_id),
  CONSTRAINT follows_pair_unique UNIQUE (follower_id, followed_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.follows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.follows TO authenticated;
GRANT INSERT (followed_id) ON TABLE public.follows TO authenticated;
GRANT DELETE ON TABLE public.follows TO authenticated;

DROP POLICY IF EXISTS follows_select_involved_unblocked ON public.follows;
DROP POLICY IF EXISTS follows_insert_self_unblocked ON public.follows;
DROP POLICY IF EXISTS follows_delete_self ON public.follows;

CREATE POLICY follows_select_involved_unblocked ON public.follows
FOR SELECT TO authenticated
USING (
  (follower_id = (SELECT auth.uid()) AND NOT public.is_user_blocked(followed_id))
  OR (followed_id = (SELECT auth.uid()) AND NOT public.is_user_blocked(follower_id))
);
CREATE POLICY follows_insert_self_unblocked ON public.follows
FOR INSERT TO authenticated
WITH CHECK (
  follower_id = (SELECT auth.uid())
  AND followed_id <> (SELECT auth.uid())
  AND NOT public.is_user_blocked(followed_id)
);
CREATE POLICY follows_delete_self ON public.follows
FOR DELETE TO authenticated
USING (follower_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS follows_followed_created_idx
  ON public.follows (followed_id, created_at DESC);

-- Delivery metadata is service-role/DB-owner only; browser roles get no grants.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 20 AND 4096),
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.notification_push_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT true,
  quiet_window_seconds integer NOT NULL DEFAULT 60 CHECK (quiet_window_seconds BETWEEN 1 AND 3600),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.notification_push_config (singleton, enabled, quiet_window_seconds)
VALUES (true, true, 60)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notification_push_windows (
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('like','comment','reply','follow')),
  target_key text NOT NULL,
  next_eligible_at timestamptz NOT NULL,
  last_notification_id uuid,
  PRIMARY KEY (recipient_id, notification_type, target_key)
);

CREATE TABLE IF NOT EXISTS public.notification_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('like','comment','reply','follow')),
  target_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','no_subscriptions','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  prepared_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_push_outbox_pending_idx
  ON public.notification_push_outbox (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.notification_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.notification_push_outbox(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','expired','dead')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_deliveries_pair_unique UNIQUE (outbox_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS notification_push_deliveries_pending_idx
  ON public.notification_push_deliveries (next_attempt_at, created_at) WHERE status = 'pending';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
  public.push_subscriptions, public.notification_push_config, public.notification_push_windows,
  public.notification_push_outbox, public.notification_push_deliveries
FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE
  public.push_subscriptions, public.notification_push_config, public.notification_push_windows,
  public.notification_push_outbox, public.notification_push_deliveries
TO service_role;

-- Clients may read their rows and change only read-state, never insert/spoof rows.
DO $$
DECLARE
  policy_row record;
  column_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', policy_row.policyname);
  END LOOP;

  REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
  FOR column_row IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
  LOOP
    EXECUTE format(
      'REVOKE ALL (%I) ON TABLE public.notifications FROM PUBLIC, anon, authenticated',
      column_row.column_name
    );
  END LOOP;
END
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read) ON TABLE public.notifications TO authenticated;

CREATE POLICY notifications_select_own ON public.notifications
FOR SELECT TO authenticated
USING (recipient_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_read_own ON public.notifications
FOR UPDATE TO authenticated
USING (recipient_id = (SELECT auth.uid()))
WITH CHECK (recipient_id = (SELECT auth.uid()));

GRANT INSERT (parent_comment_id) ON TABLE public.comments TO authenticated;

DROP POLICY IF EXISTS comments_insert_unblocked ON public.comments;
CREATE POLICY comments_insert_unblocked ON public.comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = comments.post_id
      AND (
        p.author_id = (SELECT auth.uid())
        OR (
          NOT public.is_user_blocked(p.author_id)
          AND NOT EXISTS (
            SELECT 1 FROM public.hidden_posts h
            WHERE h.user_id = (SELECT auth.uid()) AND h.post_id = p.id
          )
        )
      )
  )
  AND (
    comments.parent_comment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.comments parent
      WHERE parent.id = comments.parent_comment_id AND parent.post_id = comments.post_id
    )
  )
);

CREATE OR REPLACE FUNCTION private.notification_users_blocked(p_left uuid, p_right uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = p_left AND b.blocked_id = p_right)
       OR (b.blocker_id = p_right AND b.blocked_id = p_left)
  )
$$;
REVOKE ALL ON FUNCTION private.notification_users_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_recipient uuid;
BEGIN
  SELECT p.author_id INTO v_recipient FROM public.posts p WHERE p.id = NEW.post_id;
  IF v_recipient IS NOT NULL
     AND v_recipient <> NEW.user_id
     AND NOT private.notification_users_blocked(v_recipient, NEW.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.hidden_posts h
       WHERE h.user_id = v_recipient AND h.post_id = NEW.post_id
     )
  THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, type, post_id, source_id, read, created_at)
    VALUES
      (v_recipient, NEW.user_id, 'like', NEW.post_id, NEW.activity_id, false, COALESCE(NEW.created_at, now()))
    ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_recipient uuid;
  v_thread_id uuid;
  v_type text;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    SELECT p.author_id INTO v_recipient FROM public.posts p WHERE p.id = NEW.post_id;
    v_thread_id := NULL;
    v_type := 'comment';
  ELSE
    SELECT parent.author_id INTO v_recipient
    FROM public.comments parent
    WHERE parent.id = NEW.parent_comment_id AND parent.post_id = NEW.post_id;

    WITH RECURSIVE ancestry(id, parent_comment_id, depth) AS (
      SELECT c.id, c.parent_comment_id, 0
      FROM public.comments c
      WHERE c.id = NEW.parent_comment_id AND c.post_id = NEW.post_id
      UNION ALL
      SELECT parent.id, parent.parent_comment_id, ancestry.depth + 1
      FROM public.comments parent
      JOIN ancestry ON ancestry.parent_comment_id = parent.id
      WHERE parent.post_id = NEW.post_id
    )
    SELECT a.id INTO v_thread_id
    FROM ancestry a
    WHERE a.parent_comment_id IS NULL
    ORDER BY a.depth DESC
    LIMIT 1;

    v_type := 'reply';
  END IF;

  IF v_recipient IS NOT NULL
     AND v_recipient <> NEW.author_id
     AND NOT private.notification_users_blocked(v_recipient, NEW.author_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.hidden_posts h
       WHERE h.user_id = v_recipient AND h.post_id = NEW.post_id
     )
  THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, type, post_id, source_id, comment_id, thread_id, read, created_at)
    VALUES (
      v_recipient, NEW.author_id, v_type, NEW.post_id, NEW.id,
      CASE WHEN v_type = 'reply' THEN NEW.parent_comment_id ELSE NULL END,
      v_thread_id, false, COALESCE(NEW.created_at, now())
    )
    ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.follower_id IS NOT NULL
     AND NEW.followed_id IS NOT NULL
     AND NEW.follower_id <> NEW.followed_id
     AND NOT private.notification_users_blocked(NEW.followed_id, NEW.follower_id)
  THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, type, profile_id, source_id, read, created_at)
    VALUES (NEW.followed_id, NEW.follower_id, 'follow', NEW.followed_id, NEW.id, false, COALESCE(NEW.created_at, now()))
    ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.notify_on_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_follow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS likes_notify ON public.likes;
CREATE TRIGGER likes_notify AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();
DROP TRIGGER IF EXISTS comments_notify ON public.comments;
CREATE TRIGGER comments_notify AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();
DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- Only a single event per recipient/type/target wins a configured quiet window.
CREATE OR REPLACE FUNCTION public.queue_notification_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_quiet_seconds integer;
  v_target_key text;
  v_rows integer;
BEGIN
  BEGIN
    IF NEW.source_id IS NULL OR NEW.type NOT IN ('like','comment','reply','follow') THEN
      RETURN NEW;
    END IF;

    SELECT c.quiet_window_seconds INTO v_quiet_seconds
    FROM public.notification_push_config c
    WHERE c.singleton = true AND c.enabled = true;
    IF NOT FOUND THEN RETURN NEW; END IF;

    CASE NEW.type
      WHEN 'like' THEN v_target_key := 'post:' || NEW.post_id::text;
      WHEN 'comment' THEN v_target_key := 'post:' || NEW.post_id::text;
      WHEN 'reply' THEN v_target_key := 'thread:' || COALESCE(NEW.thread_id, NEW.comment_id)::text;
      WHEN 'follow' THEN v_target_key := 'profile:' || COALESCE(NEW.profile_id, NEW.recipient_id)::text;
    END CASE;
    IF v_target_key IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.notification_push_windows
      (recipient_id, notification_type, target_key, next_eligible_at, last_notification_id)
    VALUES (
      NEW.recipient_id, NEW.type, v_target_key,
      clock_timestamp() + make_interval(secs => v_quiet_seconds), NEW.id
    )
    ON CONFLICT (recipient_id, notification_type, target_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      UPDATE public.notification_push_windows w
      SET next_eligible_at = clock_timestamp() + make_interval(secs => v_quiet_seconds),
          last_notification_id = NEW.id
      WHERE w.recipient_id = NEW.recipient_id
        AND w.notification_type = NEW.type
        AND w.target_key = v_target_key
        AND w.next_eligible_at <= clock_timestamp();
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    END IF;

    IF v_rows > 0 THEN
      INSERT INTO public.notification_push_outbox
        (notification_id, recipient_id, notification_type, target_key)
      VALUES (NEW.id, NEW.recipient_id, NEW.type, v_target_key)
      ON CONFLICT (notification_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not enqueue notification push for notification %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.queue_notification_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_queue_push ON public.notifications;
CREATE TRIGGER notifications_queue_push AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.queue_notification_push();

CREATE OR REPLACE FUNCTION public.prepare_notification_push_deliveries(p_batch_size integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_prepared integer;
BEGIN
  WITH picked AS (
    SELECT o.id, o.recipient_id FROM public.notification_push_outbox o
    WHERE o.status = 'pending'
    ORDER BY o.created_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_batch_size, 50), 1), 100)
  ),
  add_deliveries AS (
    INSERT INTO public.notification_push_deliveries (outbox_id, subscription_id)
    SELECT p.id, s.id
    FROM picked p
    JOIN public.push_subscriptions s ON s.user_id = p.recipient_id
    WHERE s.expiration_time IS NULL OR s.expiration_time > now()
    ON CONFLICT (outbox_id, subscription_id) DO NOTHING
    RETURNING outbox_id
  ),
  mark_outbox AS (
    UPDATE public.notification_push_outbox o
    SET status = CASE WHEN EXISTS (
          SELECT 1 FROM public.push_subscriptions s
          WHERE s.user_id = o.recipient_id
            AND (s.expiration_time IS NULL OR s.expiration_time > now())
        ) THEN 'processing' ELSE 'no_subscriptions' END,
        prepared_at = now(),
        completed_at = CASE WHEN EXISTS (
          SELECT 1 FROM public.push_subscriptions s
          WHERE s.user_id = o.recipient_id
            AND (s.expiration_time IS NULL OR s.expiration_time > now())
        ) THEN NULL ELSE now() END
    FROM picked p
    WHERE o.id = p.id
    RETURNING o.id
  )
  SELECT count(*)::integer INTO v_prepared FROM mark_outbox;
  RETURN COALESCE(v_prepared, 0);
END
$$;

CREATE OR REPLACE FUNCTION public.claim_notification_push_deliveries(p_batch_size integer DEFAULT 30)
RETURNS TABLE (
  delivery_id uuid, outbox_id uuid, subscription_id uuid, attempt_count integer,
  endpoint text, p256dh text, auth text, recipient_id uuid, notification_type text,
  post_id uuid, comment_id uuid, thread_id uuid, profile_id uuid, actor_id uuid,
  notification_created_at timestamptz, target_key text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT d.id
    FROM public.notification_push_deliveries d
    JOIN public.push_subscriptions s ON s.id = d.subscription_id
    JOIN public.notification_push_outbox o ON o.id = d.outbox_id
    WHERE o.status = 'processing'
      AND (s.expiration_time IS NULL OR s.expiration_time > now())
      AND (
        (d.status = 'pending' AND d.next_attempt_at <= now())
        OR (d.status = 'processing' AND d.locked_at < now() - interval '5 minutes')
      )
    ORDER BY d.next_attempt_at, d.created_at, d.id
    FOR UPDATE OF d SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_batch_size, 30), 1), 100)
  ),
  claimed AS (
    UPDATE public.notification_push_deliveries d
    SET status = 'processing', locked_at = now(), attempt_count = d.attempt_count + 1
    FROM picked p
    WHERE d.id = p.id
    RETURNING d.id AS delivery_id, d.outbox_id, d.subscription_id, d.attempt_count
  )
  SELECT c.delivery_id, c.outbox_id, c.subscription_id, c.attempt_count,
         s.endpoint, s.p256dh, s.auth, n.recipient_id, n.type, n.post_id,
         n.comment_id, n.thread_id, n.profile_id, n.actor_id, n.created_at, o.target_key
  FROM claimed c
  JOIN public.push_subscriptions s ON s.id = c.subscription_id
  JOIN public.notification_push_outbox o ON o.id = c.outbox_id
  JOIN public.notifications n ON n.id = o.notification_id;
END
$$;

CREATE OR REPLACE FUNCTION public.finalize_notification_push_outbox(p_outbox_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_status text;
BEGIN
  UPDATE public.notification_push_outbox o
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.notification_push_deliveries d WHERE d.outbox_id = o.id
        ) THEN 'no_subscriptions'
        WHEN EXISTS (
          SELECT 1 FROM public.notification_push_deliveries d
          WHERE d.outbox_id = o.id AND d.status IN ('pending','processing')
        ) THEN 'processing'
        WHEN EXISTS (
          SELECT 1 FROM public.notification_push_deliveries d
          WHERE d.outbox_id = o.id AND d.status = 'delivered'
        ) THEN 'delivered'
        ELSE 'failed'
      END,
      completed_at = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.notification_push_deliveries d
          WHERE d.outbox_id = o.id AND d.status IN ('pending','processing')
        ) THEN now()
        ELSE NULL
      END
  WHERE o.id = p_outbox_id
  RETURNING o.status INTO v_status;
  RETURN v_status;
END
$$;

REVOKE ALL ON FUNCTION public.prepare_notification_push_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_push_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_notification_push_outbox(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_notification_push_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_notification_push_outbox(uuid) TO service_role;

-- Runs once per minute. Without both Vault values this job is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'campus-connect-notification-push-dispatch' AND username = current_user
  ) THEN
    PERFORM cron.schedule(
      'campus-connect-notification-push-dispatch',
      '* * * * *',
      $job$
        SELECT CASE
          WHEN EXISTS (
            SELECT 1 FROM vault.decrypted_secrets
            WHERE name = 'campus_connect_project_url' AND decrypted_secret <> ''
          )
          AND EXISTS (
            SELECT 1 FROM vault.decrypted_secrets
            WHERE name = 'campus_connect_notification_push_secret' AND decrypted_secret <> ''
          )
          THEN net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'campus_connect_project_url' LIMIT 1)
                   || '/functions/v1/deliver-notification-push',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-internal-push-secret',
              (SELECT decrypted_secret FROM vault.decrypted_secrets
               WHERE name = 'campus_connect_notification_push_secret' LIMIT 1)
            ),
            body := '{"batch_size":30}'::jsonb,
            timeout_milliseconds := 1000
          )
          ELSE NULL::bigint
        END;
      $job$
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

COMMIT;
