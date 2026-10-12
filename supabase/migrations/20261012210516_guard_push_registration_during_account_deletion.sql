-- Reject new device registrations once account deletion begins.
-- The Edge Function validates the bearer with Auth and invokes this RPC as service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_existing_user uuid;
  v_subscription_id uuid;
  v_subscription_count integer;
  v_existing_found boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_endpoint IS NULL OR p_endpoint !~ '^https://' OR char_length(p_endpoint) > 2048
     OR p_p256dh IS NULL OR char_length(p_p256dh) NOT BETWEEN 20 AND 512
     OR p_auth_secret IS NULL OR char_length(p_auth_secret) NOT BETWEEN 8 AND 256 THEN
    RAISE EXCEPTION 'Invalid push subscription.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_user_id) THEN
    RAISE EXCEPTION 'Account unavailable.' USING ERRCODE='42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.account_deletion_jobs j
    WHERE j.user_id=p_user_id
      AND j.status NOT IN ('complete','disabled_anonymized')
  ) THEN
    RAISE EXCEPTION 'Account is being deleted.' USING ERRCODE='42501';
  END IF;

  -- Lock both endpoint ownership and the account's subscription quota.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_endpoint, 601213));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 601214));
  SELECT s.user_id INTO v_existing_user
  FROM public.push_subscriptions s
  WHERE s.endpoint=p_endpoint
  FOR UPDATE;
  v_existing_found := FOUND;

  IF v_existing_found AND v_existing_user <> p_user_id THEN
    RAISE EXCEPTION 'Push endpoint already belongs to another account.' USING ERRCODE='42501';
  END IF;

  SELECT count(*) INTO v_subscription_count
  FROM public.push_subscriptions s
  WHERE s.user_id=p_user_id;
  IF NOT v_existing_found AND v_subscription_count >= 10 THEN
    RAISE EXCEPTION 'Too many push subscriptions for this account.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth_secret, updated_at, last_seen_at)
  VALUES (p_user_id, p_endpoint, p_p256dh, p_auth_secret, now(), now())
  ON CONFLICT (endpoint) DO UPDATE SET
    p256dh=excluded.p256dh,
    auth_secret=excluded.auth_secret,
    updated_at=now(),
    last_seen_at=now()
  WHERE public.push_subscriptions.user_id=excluded.user_id
  RETURNING id INTO v_subscription_id;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Push subscription registration failed.' USING ERRCODE='42501';
  END IF;
  RETURN v_subscription_id;
END
$function$;

COMMIT;
