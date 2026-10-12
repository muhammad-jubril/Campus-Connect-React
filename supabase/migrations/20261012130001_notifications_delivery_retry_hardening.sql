-- Notification delivery worker recovery and terminal suppression states.
BEGIN;

ALTER TABLE public.notification_push_deliveries
  DROP CONSTRAINT IF EXISTS notification_push_deliveries_status_check;

ALTER TABLE public.notification_push_deliveries
  ADD CONSTRAINT notification_push_deliveries_status_check
  CHECK (status IN ('pending','processing','delivered','expired','dead','suppressed'));

CREATE OR REPLACE FUNCTION public.expire_notification_push_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  UPDATE public.notification_push_deliveries d
  SET status = 'expired',
      locked_at = NULL,
      last_error = 'subscription_expired'
  FROM public.push_subscriptions s
  WHERE d.subscription_id = s.id
    AND s.expiration_time IS NOT NULL
    AND s.expiration_time <= now()
    AND d.status IN ('pending','processing');

  DELETE FROM public.push_subscriptions
  WHERE expiration_time IS NOT NULL AND expiration_time <= now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION public.expire_notification_push_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_notification_push_subscriptions() TO service_role;

COMMIT;
