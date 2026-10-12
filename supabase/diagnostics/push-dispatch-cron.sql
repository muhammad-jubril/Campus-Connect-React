-- Run as the postgres role after the Vault secrets below exist.
-- The live dispatcher validates the custom secret against Vault with a
-- service-role-only RPC and reads its VAPID keys from Vault; no VAPID private
-- key or service-role key is embedded in this file.
--
-- Required Vault entries:
--   campus_connect_project_url
--   campus_connect_anon_jwt
--   campus_connect_push_dispatch_secret
--   campus_connect_vapid_public_key
--   campus_connect_vapid_private_key
--   campus_connect_vapid_subject
--
-- This intentionally replaces the existing job of the same name.
select cron.unschedule(jobid)
from cron.job
where jobname = 'campus-connect-push-dispatch';

select cron.schedule(
  'campus-connect-push-dispatch',
  '* * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'campus_connect_project_url'
      ) || '/functions/v1/dispatch-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'campus_connect_anon_jwt'
        ),
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'campus_connect_anon_jwt'
        ),
        'x-push-dispatch-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'campus_connect_push_dispatch_secret'
        )
      ),
      body := '{"limit": 50}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);

-- Verification: do not select or print Vault values.
-- select jobid, jobname, schedule, active from cron.job where jobname='campus-connect-push-dispatch';
-- select status, return_message, start_time, end_time from cron.job_run_details
-- where jobid=(select jobid from cron.job where jobname='campus-connect-push-dispatch')
-- order by start_time desc limit 20;
-- HTTP responses are also observable in net._http_response (status_code, error_msg, created).
