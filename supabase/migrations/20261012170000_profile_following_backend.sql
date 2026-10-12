-- Forward migration for Campus Connect profile followers/following.
-- The relationship table is a public-to-authenticated graph only for pairs that
-- are not blocked by the signed-in viewer. Writes remain owner-scoped and clients
-- can provide only following_id; auth.uid() supplies follower_id.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.blocked_users') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regprocedure('public.is_user_blocked(uuid)') IS NULL
     OR to_regprocedure('public.is_notification_pair_blocked(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Profile following migration requires profiles, blocked_users, notifications, is_user_blocked(uuid), and is_notification_pair_blocked(uuid,uuid). Apply the base schema/security/notification migrations first.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id),
  CONSTRAINT follows_follower_following_unique UNIQUE (follower_id, following_id)
);

-- Align an already-existing follows relation with the client contract without
-- replacing its rows. In particular, older versions may not have an id column.
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
DECLARE
  missing_columns text;
  follower_attnum smallint;
  following_attnum smallint;
BEGIN
  SELECT string_agg(required.column_name, ', ')
    INTO missing_columns
  FROM (VALUES ('follower_id'), ('following_id')) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.table_name='follows'
      AND c.column_name=required.column_name
  );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Profile following migration stopped: public.follows is missing required columns: %.', missing_columns;
  END IF;

  UPDATE public.follows SET id=gen_random_uuid() WHERE id IS NULL;
  UPDATE public.follows SET created_at=now() WHERE created_at IS NULL;

  ALTER TABLE public.follows ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.follows ALTER COLUMN id SET NOT NULL;
  ALTER TABLE public.follows ALTER COLUMN follower_id SET DEFAULT auth.uid();
  ALTER TABLE public.follows ALTER COLUMN follower_id SET NOT NULL;
  ALTER TABLE public.follows ALTER COLUMN following_id SET NOT NULL;
  ALTER TABLE public.follows ALTER COLUMN created_at SET DEFAULT now();
  ALTER TABLE public.follows ALTER COLUMN created_at SET NOT NULL;

  follower_attnum := (SELECT attnum FROM pg_attribute WHERE attrelid='public.follows'::regclass AND attname='follower_id' AND NOT attisdropped);
  following_attnum := (SELECT attnum FROM pg_attribute WHERE attrelid='public.follows'::regclass AND attname='following_id' AND NOT attisdropped);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.follows'::regclass
      AND c.contype='f'
      AND c.confrelid='public.profiles'::regclass
      AND c.conkey=ARRAY[follower_attnum]::smallint[]
  ) THEN
    ALTER TABLE public.follows ADD CONSTRAINT follows_follower_profile_fkey
      FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.follows'::regclass
      AND c.contype='f'
      AND c.confrelid='public.profiles'::regclass
      AND c.conkey=ARRAY[following_attnum]::smallint[]
  ) THEN
    ALTER TABLE public.follows ADD CONSTRAINT follows_following_profile_fkey
      FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.follows'::regclass
      AND c.contype='c'
      AND c.conname='follows_no_self_follow'
  ) THEN
    ALTER TABLE public.follows ADD CONSTRAINT follows_no_self_follow
      CHECK (follower_id <> following_id) NOT VALID;
  END IF;
  ALTER TABLE public.follows VALIDATE CONSTRAINT follows_no_self_follow;

  -- If a primary/unique constraint already guarantees the pair, don't add a
  -- duplicate index. Otherwise the unique index is the race-safe authority.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.follows'::regclass
      AND c.contype IN ('p','u')
      AND cardinality(c.conkey)=2
      AND c.conkey @> ARRAY[follower_attnum, following_attnum]::smallint[]
  ) THEN
    CREATE UNIQUE INDEX follows_follower_following_uidx
      ON public.follows (follower_id, following_id);
  END IF;
END
$$;

DO $$
DECLARE id_attnum smallint;
BEGIN
  id_attnum := (SELECT attnum FROM pg_attribute WHERE attrelid='public.follows'::regclass AND attname='id' AND NOT attisdropped);
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.follows'::regclass
      AND c.contype IN ('p','u')
      AND cardinality(c.conkey)=1
      AND c.conkey @> ARRAY[id_attnum]::smallint[]
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS follows_id_uidx ON public.follows (id);
  END IF;
END
$$;
-- The id tie-breaker keeps pagination deterministic when multiple follows share
-- the same transaction timestamp. Rebuild these non-constraint indexes so an
-- already-installed older index definition doesn't silently retain the old order.
DROP INDEX IF EXISTS public.follows_following_created_idx;
CREATE INDEX follows_following_created_idx
  ON public.follows (following_id, created_at DESC, id DESC, follower_id);
DROP INDEX IF EXISTS public.follows_follower_created_idx;
CREATE INDEX follows_follower_created_idx
  ON public.follows (follower_id, created_at DESC, id DESC, following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Remove legacy/permissive policies rather than accidentally OR-ing a broad one
-- with these restrictions. Both participants must be visible to this viewer.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='follows'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.follows', p.policyname);
  END LOOP;
END
$$;

REVOKE ALL ON TABLE public.follows FROM PUBLIC, anon, authenticated;
DO $$
DECLARE c record;
BEGIN
  -- Table-level REVOKE does not remove previously granted column-level rights.
  -- Clear those too before granting only the supported client operations.
  FOR c IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='follows'
  LOOP
    EXECUTE format(
      'REVOKE ALL (%I) ON TABLE public.follows FROM PUBLIC, anon, authenticated',
      c.column_name
    );
  END LOOP;
END
$$;
GRANT SELECT ON TABLE public.follows TO authenticated;
GRANT INSERT (following_id) ON TABLE public.follows TO authenticated;
GRANT DELETE ON TABLE public.follows TO authenticated;

CREATE POLICY follows_select_visible_unblocked_pairs
ON public.follows FOR SELECT TO authenticated
USING (
  NOT public.is_user_blocked(follower_id)
  AND NOT public.is_user_blocked(following_id)
);

CREATE POLICY follows_insert_self_unblocked
ON public.follows FOR INSERT TO authenticated
WITH CHECK (
  follower_id=(SELECT auth.uid())
  AND following_id<>(SELECT auth.uid())
  AND NOT public.is_user_blocked(following_id)
);

CREATE POLICY follows_delete_self
ON public.follows FOR DELETE TO authenticated
USING (follower_id=(SELECT auth.uid()));

-- The base notifications migration installs this trigger only when follows exists
-- at that time. Since this migration creates the relationship later, attach it
-- explicitly now. A source-keyed unique index prevents duplicate notifications if
-- a trigger is re-fired for the same relationship event.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS profile_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_activity_once_uidx
  ON public.notifications (recipient_id, type, source_id)
  WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_on_follow_relationship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.follower_id IS NULL
     OR NEW.following_id IS NULL
     OR NEW.follower_id=NEW.following_id
     OR public.is_notification_pair_blocked(NEW.follower_id, NEW.following_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, source_id, profile_id, read, created_at)
  VALUES
    (NEW.following_id, NEW.follower_id, 'follow', NEW.id, NEW.following_id, false, COALESCE(NEW.created_at, now()))
  ON CONFLICT (recipient_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.notify_on_follow_relationship() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS follows_notify_recipient ON public.follows;
CREATE TRIGGER follows_notify_recipient
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow_relationship();

COMMIT;
