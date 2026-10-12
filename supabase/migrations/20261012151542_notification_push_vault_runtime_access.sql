-- Add the service-role-only Vault runtime reader used by the dispatcher.
-- A later migration guards it with the dispatch secret before returning config.
create or replace function public.get_notification_push_runtime_config()
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'vapid_public_key', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'campus_connect_vapid_public_key'
    ),
    'vapid_private_key', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'campus_connect_vapid_private_key'
    ),
    'vapid_subject', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'campus_connect_vapid_subject'
    ),
    'dispatch_secret', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'campus_connect_push_dispatch_secret'
    )
  );
$function$;

revoke all on function public.get_notification_push_runtime_config() from public;
revoke all on function public.get_notification_push_runtime_config() from anon, authenticated;
grant execute on function public.get_notification_push_runtime_config() to service_role;

create index if not exists push_notification_queue_latest_notification_idx
  on public.push_notification_queue (latest_notification_id)
  where latest_notification_id is not null;
