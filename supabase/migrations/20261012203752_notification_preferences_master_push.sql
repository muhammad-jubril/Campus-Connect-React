-- Account-wide push master switch. Device/browser registration remains a separate concern.
-- Defaults preserve existing opted-in users; this migration changes no notification history.
BEGIN;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true;

GRANT INSERT (push_enabled)
  ON TABLE public.notification_preferences TO authenticated;
GRANT UPDATE (push_enabled)
  ON TABLE public.notification_preferences TO authenticated;

COMMENT ON COLUMN public.notification_preferences.push_enabled IS
  'Account-wide Web Push master preference. When false, the trusted dispatcher skips all device deliveries for this user while retaining in-app notification history.';

COMMIT;
