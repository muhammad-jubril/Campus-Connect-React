# Web Push deployment checklist

The app can register a browser subscription only after the `push-subscriptions` Supabase Edge Function and the notification queue migration are deployed. Actual delivery additionally requires the `dispatch-push-notifications` function and a scheduled caller. A successful frontend build does not prove device delivery.

## 1. Apply the migration

Apply the following migrations in this order through the project's established Supabase migration workflow:

1. `supabase/migrations/20261012140537_notifications_push_pipeline.sql` — the existing queue, subscriptions, receipts, service-role RPCs, retry handling and 60-second initial batching infrastructure.
2. `supabase/migrations/20261012140543_notifications_relationships.sql` — adds reply parents/thread targets, server-generated per-source notification IDs, the real `public.follows` relation, configurable quiet-window settings, stricter notification RLS/column grants and block-aware selectors.

They assume the existing notification/security migrations and base tables are already present. Inspect the diff and migration result; do not apply to an unrelated or empty project. Both migrations are forward-only and avoid deleting existing app/activity rows.

The pipeline migration adds private `push_subscriptions`, `push_notification_queue`, and `push_delivery_receipts` tables. The relationship migration adds `comments.parent_comment_id`, `public.follows` and `public.notification_push_config`. Only `service_role` can access the private push metadata/config tables directly. Client subscription operations pass through the JWT-authenticated Edge Function and service-role-only RPCs; activity notification rows are never client-inserted.

## 2. Configure Edge Function secrets

Generate a VAPID key pair using a trusted Web Push key generator or `web-push generate-vapid-keys`. Store the values only in Supabase Function Secrets:

- `VAPID_PUBLIC_KEY` — public part, also configured as `VITE_WEB_PUSH_PUBLIC_KEY` for Vite.
- `VAPID_PRIVATE_KEY` — private key; never put this in `VITE_*`, source code, Git, build output, or browser JS.
- `VAPID_SUBJECT` — a contact URI such as `mailto:admin@example.com`.
- `PUSH_DISPATCH_SECRET` — random secret of at least 32 characters, shared only with the scheduled caller and dispatch function.
- `ALLOWED_ORIGINS` — comma-separated allowed browser origins, including the production site and intended development origins.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not copy the service-role key into `.env.example` or any Vite variable.

Deploy both functions:

```sh
supabase functions deploy push-subscriptions
supabase functions deploy dispatch-push-notifications
```

Set frontend configuration in the hosting environment, then rebuild/redeploy:

```text
VITE_WEB_PUSH_PUBLIC_KEY=<public VAPID key>
VITE_PUSH_SUBSCRIPTION_ENDPOINT=https://<project-ref>.supabase.co/functions/v1/push-subscriptions
```

## 3. Schedule the queue dispatcher

The queue sets `deliver_after` to the configured `quiet_window_seconds` (default 60; allowed 1–3600) after the first event in a pending group. The setting is seeded with `enabled = false` so activity cannot pile up for delayed delivery before VAPID secrets and the scheduler are configured. Change the window with `UPDATE public.notification_push_config SET quiet_window_seconds = 60, updated_at = now() WHERE singleton = true;`. New activity joins the pending group without moving the initial deadline; once a batch is being processed, later activity starts the next window. Setting `enabled = false` temporarily disables push queuing only; in-app notification/activity rows continue to persist. Configure a one-minute Supabase Cron job (or an authenticated external scheduler) to `POST` to:

`https://<project-ref>.supabase.co/functions/v1/dispatch-push-notifications`

Send `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` so the Supabase function gateway accepts the request, and `x-push-dispatch-secret: <PUSH_DISPATCH_SECRET>` for the worker's second check. Store both values in Supabase Vault or your scheduler's secret store, never in this repo or SQL committed to Git. Request body may be `{ "limit": 50 }`.

If using Supabase Cron + `pg_net`, store `project_url`, `service_role_key`, and `push_dispatch_secret` in Vault first, enable the `pg_cron`, `pg_net`, and Vault extensions in the project, then run `supabase/diagnostics/push-dispatch-cron.sql` as the `postgres` role. Verify job responses in `cron.job_run_details` and Edge Function logs; the script replaces an existing job with the same name.

## 4. Frontend relationship contract

The frontend grouping code reads `comment_id` before `thread_id`. Accordingly, the relationship migration stores the root/top-level comment ID in both notification fields for a reply, while source comments retain the actual immediate parent in `parent_comment_id`. The post-detail and comments-modal reply actions now write the selected parent ID, and other-student profile pages follow/unfollow through `public.follows` using only `following_id`. Browser code never writes to `public.notifications`.

The existing UI groups follow notices by UTC calendar day. The push queue groups following activity by the followed profile (the recipient) during the 60-second quiet window. Like and top-level comment pushes group per post; replies group per root thread.

## 5. Enable push after configuration

After the Edge Function secrets are set, both functions deployed, the scheduler is running and a test push has been accepted by a provider, enable new push queue entries:

```sql
update public.notification_push_config
set enabled = true, updated_at = now()
where singleton = true;
```

Until this explicit step, the in-app notification rows continue to persist, but new push batches are not queued. The 60-second quiet-window value is still ready for configuration.

## 6. Verify live behaviour

Use two test accounts and a supported HTTPS browser/device. Verify likes and comments queue only for another account, no push before the first 60 seconds, multiple same-group activities coalesce, a new event while a batch is processing enters a later batch, read notifications and newly blocked pairs don't deliver, and a worker retry doesn't re-send devices already recorded as delivered. Disable push on one device and verify only the caller's endpoint is removed. Force a test expired endpoint in a non-production environment and confirm HTTP 404/410 cleanup.

## Important feature boundary

The current frontend now provides nested reply controls in the comments modal and post detail page, plus follow/unfollow controls on other students' profiles. Those controls depend on applying `20261012140543_notifications_relationships.sql` to the live Supabase project so the `parent_comment_id` column and `public.follows` relation exist with their RLS policies. Source tests validate the frontend contract but do not prove the live migration has been applied or that end-to-end event delivery is active.
