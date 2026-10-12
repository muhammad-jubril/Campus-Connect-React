-- Require the shared dispatch secret before returning any VAPID material.
-- The dispatch secret itself is compared inside SQL and is never returned.
drop function if exists public.get_notification_push_runtime_config();

create function public.get_notification_push_runtime_config(p_dispatch_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  stored_dispatch_secret text;
  config jsonb;
begin
  select decrypted_secret
    into stored_dispatch_secret
  from vault.decrypted_secrets
  where name = 'campus_connect_push_dispatch_secret';

  if stored_dispatch_secret is null
     or p_dispatch_secret is null
     or length(p_dispatch_secret) < 32
     or stored_dispatch_secret <> p_dispatch_secret then
    return null;
  end if;

  select jsonb_build_object(
    'vapid_public_key', (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'campus_connect_vapid_public_key'
    ),
    'vapid_private_key', (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'campus_connect_vapid_private_key'
    ),
    'vapid_subject', (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'campus_connect_vapid_subject'
    )
  ) into config;

  return config;
end;
$function$;

revoke all on function public.get_notification_push_runtime_config(text) from public;
revoke all on function public.get_notification_push_runtime_config(text) from anon, authenticated;
grant execute on function public.get_notification_push_runtime_config(text) to service_role;
