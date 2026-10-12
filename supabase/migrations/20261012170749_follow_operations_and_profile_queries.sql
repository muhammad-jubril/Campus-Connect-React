-- Idempotent follow operations and profile-safe followers/following reads.
-- Builds on the existing public.follows table and its existing notification trigger.
-- No relationship, profile, or notification rows are deleted or reshaped.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.follows') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.blocked_users') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regprocedure('public.notify_on_follow_relationship()') IS NULL
     OR to_regprocedure('public.is_notification_pair_blocked(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_user_blocked(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Follow operations migration stopped: required follows, profiles, blocking helpers, notifications, or existing notification function is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.follows'::regclass
      AND conname = 'follows_follower_following_unique'
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.follows'::regclass
      AND conname = 'follows_no_self_follow'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION
      'Follow operations migration stopped: expected unique follower/following and self-follow constraints were not found.';
  END IF;
END
$preflight$;

CREATE INDEX IF NOT EXISTS follows_follower_created_idx
  ON public.follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_following_created_idx
  ON public.follows (following_id, created_at DESC);

-- Client writes must use the RPCs so mutation semantics, block checks, and
-- idempotent return values cannot be bypassed. The existing SELECT RLS remains.
REVOKE INSERT (following_id) ON TABLE public.follows FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.follows FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON TABLE public.follows FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON TABLE public.follows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.follows TO authenticated;

CREATE OR REPLACE FUNCTION public.follow_student(p_following_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_follow_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_following_id IS NULL THEN
    RAISE EXCEPTION 'A student profile is required' USING ERRCODE = '22023';
  END IF;
  IF p_following_id = v_actor_id THEN
    RAISE EXCEPTION 'You cannot follow your own profile' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_following_id) THEN
    RAISE EXCEPTION 'Student profile unavailable' USING ERRCODE = '23503';
  END IF;
  IF public.is_notification_pair_blocked(v_actor_id, p_following_id) THEN
    RAISE EXCEPTION 'This follow is not permitted' USING ERRCODE = '42501';
  END IF;

  -- Serialize attempts for this pair. The unique constraint remains the final
  -- concurrency guard. Only an inserted row runs the existing AFTER INSERT trigger.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text || ':' || p_following_id::text, 20261012)
  );

  INSERT INTO public.follows (follower_id, following_id)
  VALUES (v_actor_id, p_following_id)
  ON CONFLICT ON CONSTRAINT follows_follower_following_unique DO NOTHING
  RETURNING id INTO v_follow_id;

  -- true = created now; false = already existed. Conflict does not fire the trigger.
  RETURN v_follow_id IS NOT NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.unfollow_student(p_following_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_following_id IS NULL THEN
    RAISE EXCEPTION 'A student profile is required' USING ERRCODE = '22023';
  END IF;
  IF p_following_id = v_actor_id THEN
    RETURN false;
  END IF;

  -- Allow cleanup even after a block; only the caller's own outgoing edge can go.
  DELETE FROM public.follows
  WHERE follower_id = v_actor_id
    AND following_id = p_following_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_follow_counts(p_profile_id uuid)
RETURNS TABLE (
  followers_count bigint,
  following_count bigint,
  is_following boolean,
  is_followed_by boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'A student profile is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile_id)
     OR public.is_user_blocked(p_profile_id) THEN
    RAISE EXCEPTION 'Student profile unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT count(*)::bigint
      FROM public.follows f
      WHERE f.following_id = p_profile_id
        AND NOT public.is_notification_pair_blocked(f.follower_id, f.following_id)
        AND NOT public.is_user_blocked(f.follower_id)
    ),
    (
      SELECT count(*)::bigint
      FROM public.follows f
      WHERE f.follower_id = p_profile_id
        AND NOT public.is_notification_pair_blocked(f.follower_id, f.following_id)
        AND NOT public.is_user_blocked(f.following_id)
    ),
    CASE
      WHEN public.is_notification_pair_blocked(v_actor_id, p_profile_id) THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = v_actor_id AND f.following_id = p_profile_id
      )
    END,
    CASE
      WHEN public.is_notification_pair_blocked(v_actor_id, p_profile_id) THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = p_profile_id AND f.following_id = v_actor_id
      )
    END;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_followers(
  p_profile_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  username text,
  name text,
  avatar_url text,
  faculty text,
  department text,
  level text,
  bio text,
  followed_at timestamptz,
  is_following boolean,
  is_followed_by boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'A student profile is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles target WHERE target.id = p_profile_id)
     OR public.is_user_blocked(p_profile_id) THEN
    RAISE EXCEPTION 'Student profile unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.name, p.avatar_url, p.faculty, p.department,
         p.level, p.bio, f.created_at,
         CASE
           WHEN public.is_notification_pair_blocked(v_actor_id, p.id) THEN false
           ELSE EXISTS (SELECT 1 FROM public.follows mine
                        WHERE mine.follower_id = v_actor_id AND mine.following_id = p.id)
         END,
         CASE
           WHEN public.is_notification_pair_blocked(v_actor_id, p.id) THEN false
           ELSE EXISTS (SELECT 1 FROM public.follows theirs
                        WHERE theirs.follower_id = p.id AND theirs.following_id = v_actor_id)
         END
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.follower_id
  WHERE f.following_id = p_profile_id
    AND NOT public.is_notification_pair_blocked(f.follower_id, f.following_id)
    AND NOT public.is_user_blocked(f.follower_id)
  ORDER BY f.created_at DESC, p.id
  LIMIT v_limit OFFSET v_offset;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_following(
  p_profile_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  username text,
  name text,
  avatar_url text,
  faculty text,
  department text,
  level text,
  bio text,
  followed_at timestamptz,
  is_following boolean,
  is_followed_by boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'A student profile is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles target WHERE target.id = p_profile_id)
     OR public.is_user_blocked(p_profile_id) THEN
    RAISE EXCEPTION 'Student profile unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.name, p.avatar_url, p.faculty, p.department,
         p.level, p.bio, f.created_at,
         CASE
           WHEN public.is_notification_pair_blocked(v_actor_id, p.id) THEN false
           ELSE EXISTS (SELECT 1 FROM public.follows mine
                        WHERE mine.follower_id = v_actor_id AND mine.following_id = p.id)
         END,
         CASE
           WHEN public.is_notification_pair_blocked(v_actor_id, p.id) THEN false
           ELSE EXISTS (SELECT 1 FROM public.follows theirs
                        WHERE theirs.follower_id = p.id AND theirs.following_id = v_actor_id)
         END
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.following_id
  WHERE f.follower_id = p_profile_id
    AND NOT public.is_notification_pair_blocked(f.follower_id, f.following_id)
    AND NOT public.is_user_blocked(f.following_id)
  ORDER BY f.created_at DESC, p.id
  LIMIT v_limit OFFSET v_offset;
END
$function$;

REVOKE ALL ON FUNCTION public.follow_student(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unfollow_student(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_follow_counts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_followers(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_following(uuid, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.follow_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_followers(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_following(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.follow_student(uuid) IS
  'Idempotently creates the authenticated user follow relationship; true only for a new row. Existing AFTER INSERT trigger creates the single follow notification.';
COMMENT ON FUNCTION public.unfollow_student(uuid) IS
  'Deletes only the authenticated user outgoing relationship; true only if a row was removed and no notification is emitted.';
COMMENT ON FUNCTION public.get_follow_counts(uuid) IS
  'Returns current non-blocked follower/following counts and viewer relationship flags for an unblocked profile.';
COMMENT ON FUNCTION public.get_followers(uuid, integer, integer) IS
  'Returns a paginated visible follower list with safe profile metadata and viewer relationship flags.';
COMMENT ON FUNCTION public.get_following(uuid, integer, integer) IS
  'Returns a paginated visible following list with safe profile metadata and viewer relationship flags.';

COMMIT;
