-- Persistent per-account push categories used by Settings and the push dispatcher.
-- Device-level enable/disable remains represented by the private push subscription.
BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid()
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_likes boolean NOT NULL DEFAULT true,
  push_comments boolean NOT NULL DEFAULT true,
  push_replies boolean NOT NULL DEFAULT true,
  push_follows boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_preferences TO authenticated;
GRANT INSERT (push_likes, push_comments, push_replies, push_follows)
  ON TABLE public.notification_preferences TO authenticated;
GRANT UPDATE (push_likes, push_comments, push_replies, push_follows)
  ON TABLE public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_preferences TO service_role;

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;

CREATE POLICY notification_preferences_select_own
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY notification_preferences_insert_own
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY notification_preferences_update_own
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.set_notification_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.set_notification_preferences_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notification_preferences_set_updated_at ON public.notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_preferences_updated_at();

-- Preserve the existing opt-in state of users who already have at least one
-- persisted push subscription. New accounts default to per-category enabled,
-- but still need to enable a browser/device subscription separately.
INSERT INTO public.notification_preferences (user_id, push_likes, push_comments, push_replies, push_follows)
SELECT DISTINCT s.user_id, true, true, true, true
FROM public.push_subscriptions s
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
