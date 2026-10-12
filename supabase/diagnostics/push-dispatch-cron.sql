-- Run as the postgres role in Supabase SQL Editor only after:
-- 1) enabling pg_cron, pg_net, and Vault;
-- 2) creating Vault secrets named project_url, service_role_key, push_dispatch_secret;
-- 3) deploying dispatch-push-notifications with the matching PUSH_DISPATCH_SECRET.
-- This script contains secret names, never the secret values.

select cron.unschedule(jobid)
from cron.job
where jobname = 'campus-connect-push-dispatch';

select cron.schedule(
  'campus-connect-push-dispatch',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url' limit 1)
             || '/functions/v1/dispatch-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key' limit 1),
        'x-push-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name='push_dispatch_secret' limit 1)
      ),
      body := '{"limit":50}'::jsonb
    );
  $job$
);

-- After enabling the job, verify execution metadata without selecting Vault values:
-- select jobid, jobname, schedule, active from cron.job where jobname='campus-connect-push-dispatch';
-- select status, return_message, start_time, end_time from cron.job_run_details
-- where jobid=(select jobid from cron.job where jobname='campus-connect-push-dispatch')
-- order by start_time desc limit 20;
