-- Notification relationship contract extension.
-- Builds on 20261012120000_notifications_push_pipeline.sql and reuses its queue,
-- subscription table, receipts, RPCs and dispatcher. This does not create a
-- second queue or delete existing notification/activity rows.
BEGIN;

-- Reply source events now have a real parent relationship. SET NULL preserves
-- child comments if a parent is deleted; existing activity is not cascaded away.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comments'::regclass
      AND conname = 'comments_parent_comment_id_fkey'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_parent_comment_id_fkey
      FOREIGN KEY (parent_comment_id)
      REFERENCES public.comments(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS comments_parent_comment_id_created_idx
  ON public.comments (parent_comment_id, created_at DESC)
  WHERE parent_comment_id IS NOT NULL;

-- Notification target/source fields are additive. comment_id and thread_id
-- both identify the root comment of a reply group (matching the existing UI's
-- grouping helper); source_id identifies the individual comment/like/follow.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS profile_id uuid;

-- A new likes.activity_id is generated for every like-row insertion, including
-- an unlike/re-like cycle. It is not client-supplied.
ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS activity_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS likes_activity_id_uidx
  ON public.likes (activity_id);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_activity_once_uidx
  ON public.notifications (recipient_id, type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_reply_thread_idx
  ON public.notifications (recipient_id, thread_id, created_at DESC)
  WHERE type = 'reply';

-- Do not let an authenticated client choose a like's activity ID or timestamp.
DO $$
DECLARE c record;
BEGIN
  REVOKE INSERT, UPDATE ON TABLE public.likes FROM PUBLIC, anon, authenticated;
  FOR c IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'likes'
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.likes FROM PUBLIC, anon, authenticated',
      c.column_name
    );
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.likes FROM PUBLIC, anon, authenticated',
      c.column_name
    );
  END LOOP;
END
$$;
GRANT INSERT (post_id, user_id) ON TABLE public.likes TO authenticated;

-- Similar column-scoped insert access protects comment IDs/timestamps while
-- allowing the UI to submit an optional parent ID. Existing ownership/visibility
-- RLS still enforces author_id = auth.uid() and post visibility.
DO $$
DECLARE c record;
BEGIN
  REVOKE INSERT ON TABLE public.comments FROM PUBLIC, anon, authenticated;
  FOR c IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments'
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.comments FROM PUBLIC, anon, authenticated',
      c.column_name
    );
  END LOOP;
END
$$;
GRANT INSERT (post_id, author_id, text, parent_comment_id)
  ON TABLE public.comments TO authenticated;

-- Validate reply targets outside the comments RLS expression so that checking a
-- parent row does not introduce a recursive policy query. A reply must stay on
-- the same post and may not cross a bilateral block. This trigger cannot be
-- invoked as a client function and reads only server-owned NEW values.
CREATE OR REPLACE FUNCTION public.validate_comment_parent_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_author uuid;
  v_parent_post_id uuid;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.author_id, c.post_id
  INTO v_parent_author, v_parent_post_id
  FROM public.comments c
  WHERE c.id = NEW.parent_comment_id;

  IF NOT FOUND OR v_parent_post_id IS DISTINCT FROM NEW.post_id THEN
    RAISE EXCEPTION 'Reply target not available' USING errcode = '23503';
  END IF;

  IF v_parent_author IS NOT NULL
     AND v_parent_author <> NEW.author_id
     AND public.is_notification_pair_blocked(v_parent_author, NEW.author_id) THEN
    RAISE EXCEPTION 'Reply target not available' USING errcode = '42501';
  END IF;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.validate_comment_parent_target() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS comments_validate_parent_target ON public.comments;
CREATE TRIGGER comments_validate_parent_target
BEFORE INSERT OR UPDATE OF parent_comment_id, post_id
ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_parent_target();

-- Add a real follow relation so the backend contract exists before the frontend
-- follow control is wired. Identity, timestamps and relationship ID are generated
-- by PostgreSQL; the caller may only choose the following_id.
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id),
  CONSTRAINT follows_follower_following_unique UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_created_idx
  ON public.follows (following_id, created_at DESC);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.follows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.follows TO authenticated;
GRANT INSERT (following_id) ON TABLE public.follows TO authenticated;
GRANT DELETE ON TABLE public.follows TO authenticated;

DROP POLICY IF EXISTS follows_select_involved_unblocked ON public.follows;
DROP POLICY IF EXISTS follows_insert_self_unblocked ON public.follows;
DROP POLICY IF EXISTS follows_delete_self ON public.follows;

CREATE POLICY follows_select_involved_unblocked
ON public.follows FOR SELECT TO authenticated
USING (
  (
    follower_id = (SELECT auth.uid())
    AND NOT public.is_user_blocked(following_id)
  )
  OR
  (
    following_id = (SELECT auth.uid())
    AND NOT public.is_user_blocked(follower_id)
  )
);

CREATE POLICY follows_insert_self_unblocked
ON public.follows FOR INSERT TO authenticated
WITH CHECK (
  follower_id = (SELECT auth.uid())
  AND following_id <> (SELECT auth.uid())
  AND NOT public.is_user_blocked(following_id)
);

CREATE POLICY follows_delete_self
ON public.follows FOR DELETE TO authenticated
USING (follower_id = (SELECT auth.uid()));

-- Tighten notifications again: all event-identity columns are backend-owned.
-- Authenticated callers may select recipient rows and update only read-state.
DO $$
DECLARE c record;
BEGIN
  REVOKE INSERT, UPDATE ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
  FOR c IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.notifications FROM PUBLIC, anon, authenticated',
      c.column_name
    );
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.notifications FROM PUBLIC, anon, authenticated',
      c.column_name
    );
  END LOOP;
END
$$;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read) ON TABLE public.notifications TO authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', p.policyname);
  END LOOP;
END
$$;

CREATE POLICY notifications_select_own
ON public.notifications FOR SELECT TO authenticated
USING (
  recipient_id = (SELECT auth.uid())
  AND NOT public.is_user_blocked(actor_id)
);
-- Rebuild every UPDATE policy, not just a known legacy name: permissive
-- RLS policies are OR-combined, so an unknown older UPDATE policy must not survive.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', p.policyname);
  END LOOP;
END
$$;
CREATE POLICY notifications_update_read_own
ON public.notifications FOR UPDATE TO authenticated
USING (recipient_id = (SELECT auth.uid()))
WITH CHECK (recipient_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
BEGIN
  SELECT p.author_id INTO v_author
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF v_author IS NULL
     OR v_author = NEW.user_id
     OR public.is_notification_pair_blocked(v_author, NEW.user_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, post_id, source_id, read, created_at)
  VALUES
    (v_author, NEW.user_id, 'like', NEW.post_id, NEW.activity_id, false, COALESCE(NEW.created_at, now()))
  ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.notify_on_like() FROM PUBLIC, anon, authenticated;

-- Only top-level comments notify the post author. Replies are a distinct row
-- sent to the parent thread's author by notify_on_comment_reply().
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
BEGIN
  IF NEW.parent_comment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.author_id INTO v_author
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF v_author IS NOT NULL
     AND v_author <> NEW.author_id
     AND NOT public.is_notification_pair_blocked(v_author, NEW.author_id) THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, type, post_id, source_id, read, created_at)
    VALUES
      (v_author, NEW.author_id, 'comment', NEW.post_id, NEW.id, false, COALESCE(NEW.created_at, now()))
    ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.notify_on_comment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_author uuid;
  v_root_comment_id uuid;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.author_id
  INTO v_parent_author
  FROM public.comments c
  WHERE c.id = NEW.parent_comment_id
    AND c.post_id = NEW.post_id;

  IF NOT FOUND
     OR v_parent_author IS NULL
     OR v_parent_author = NEW.author_id
     OR public.is_notification_pair_blocked(v_parent_author, NEW.author_id) THEN
    RETURN NEW;
  END IF;

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
  SELECT ancestry.id
  INTO v_root_comment_id
  FROM ancestry
  WHERE ancestry.parent_comment_id IS NULL
  ORDER BY ancestry.depth DESC
  LIMIT 1;

  IF v_root_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Keep the original notification row per reply. Both target columns name the
  -- root thread so the existing frontend grouping helper doesn't merge by a
  -- different immediate parent than the push queue.
  INSERT INTO public.notifications
    (recipient_id, actor_id, type, post_id, comment_id, thread_id, source_id, read, created_at)
  VALUES
    (v_parent_author, NEW.author_id, 'reply', NEW.post_id, v_root_comment_id,
     v_root_comment_id, NEW.id, false, COALESCE(NEW.created_at, now()))
  ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.notify_on_comment_reply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS comments_notify_reply ON public.comments;
CREATE TRIGGER comments_notify_reply
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment_reply();

CREATE OR REPLACE FUNCTION public.notify_on_follow_relationship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.follower_id IS NULL
     OR NEW.following_id IS NULL
     OR NEW.follower_id = NEW.following_id
     OR public.is_notification_pair_blocked(NEW.follower_id, NEW.following_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, profile_id, source_id, read, created_at)
  VALUES
    (NEW.following_id, NEW.follower_id, 'follow', NEW.following_id, NEW.id, false, COALESCE(NEW.created_at, now()))
  ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.notify_on_follow_relationship() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS follows_notify_recipient ON public.follows;
CREATE TRIGGER follows_notify_recipient
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow_relationship();

-- One server-owned configuration row controls push eligibility and the
-- quiet-window duration. Disabling it never disables in-app notification rows.
CREATE TABLE IF NOT EXISTS public.notification_push_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT true,
  quiet_window_seconds integer NOT NULL DEFAULT 60
    CHECK (quiet_window_seconds BETWEEN 1 AND 3600),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.notification_push_config (singleton, enabled, quiet_window_seconds)
VALUES (true, false, 60)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.notification_push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_push_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_push_config TO service_role;

-- Reuse the existing push notification queue and its advisory-lock quiet window.
-- Replies group by the root thread, follows by the recipient profile, likes and
-- top-level comments by post. Push aggregation never replaces in-app rows.
CREATE OR REPLACE FUNCTION public.queue_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_key text;
  v_quiet_seconds integer;
BEGIN
  BEGIN
    IF NEW.recipient_id IS NULL OR NEW.actor_id IS NULL OR NEW.actor_id = NEW.recipient_id THEN
      RETURN NEW;
    END IF;

    IF public.is_notification_pair_blocked(NEW.recipient_id, NEW.actor_id) THEN
      RETURN NEW;
    END IF;

    SELECT c.quiet_window_seconds INTO v_quiet_seconds
    FROM public.notification_push_config c
    WHERE c.singleton = true AND c.enabled = true;
    IF NOT FOUND THEN RETURN NEW; END IF;

    IF NEW.type = 'like' AND NEW.post_id IS NOT NULL THEN
      v_group_key := 'like:post:' || NEW.post_id::text;
    ELSIF NEW.type = 'comment' AND NEW.post_id IS NOT NULL THEN
      v_group_key := 'comment:post:' || NEW.post_id::text;
    ELSIF NEW.type = 'reply' AND COALESCE(NEW.thread_id, NEW.comment_id) IS NOT NULL THEN
      v_group_key := 'reply:thread:' || COALESCE(NEW.thread_id, NEW.comment_id)::text;
    ELSIF NEW.type = 'follow' THEN
      v_group_key := 'follow:profile:' || COALESCE(NEW.profile_id, NEW.recipient_id)::text;
    ELSE
      RETURN NEW;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.recipient_id::text || ':' || v_group_key, 601212)
    );

    UPDATE public.push_notification_queue q
    SET latest_notification_id = CASE WHEN NEW.created_at >= q.last_activity_at THEN NEW.id ELSE q.latest_notification_id END,
        activity_count = q.activity_count + 1,
        last_activity_at = GREATEST(q.last_activity_at, NEW.created_at),
        updated_at = now()
    WHERE q.recipient_id = NEW.recipient_id AND q.group_key = v_group_key AND q.status = 'pending';

    IF NOT FOUND THEN
      INSERT INTO public.push_notification_queue
        (recipient_id, group_key, latest_notification_id, activity_count, first_activity_at, last_activity_at, deliver_after)
      VALUES (
        NEW.recipient_id, v_group_key, NEW.id, 1, NEW.created_at, NEW.created_at,
        GREATEST(NEW.created_at, clock_timestamp()) + make_interval(secs => v_quiet_seconds)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- A broken push queue must never roll back the persisted in-app notification.
    RAISE WARNING 'Could not queue push for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.queue_notification_push() FROM PUBLIC, anon, authenticated;

-- Trigger queueing is ordered by creation on notifications and works for the
-- existing trigger function; ensure publication membership if this migration is
-- deployed independently in an environment where the base publication setup was
-- skipped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

COMMIT;
