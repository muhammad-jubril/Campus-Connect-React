# Web Push deployment checklist

The app can register a browser subscription only after the `push-subscriptions` Supabase Edge Function and the notification queue migration are deployed. Actual delivery additionally requires the `dispatch-push-notifications` function and a scheduled caller. A successful frontend build does not prove device delivery.

## 1. Apply the migration

Run `supabase/migrations/20261012120000_notifications_push_pipeline.sql` through the same migration workflow used for the project. It assumes the existing notification/security migrations and tables are already present. Inspect migration output; don't apply it to an unrelated or empty Supabase project.

The migration adds private `push_subscriptions`, `push_notification_queue`, and `push_delivery_receipts` tables. Only `service_role` can access them directly. Client operations pass through authenticated Edge Functions and service-role-only RPCs.

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

The queue sets `deliver_after` to exactly 60 seconds after the first event in a pending group. New activity joins that pending group without moving the initial deadline; once a batch is being processed, later activity starts the next window. Configure a one-minute Supabase Cron job (or an authenticated external scheduler) to `POST` to:

`https://<project-ref>.supabase.co/functions/v1/dispatch-push-notifications`

Send `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` so the Supabase function gateway accepts the request, and `x-push-dispatch-secret: <PUSH_DISPATCH_SECRET>` for the worker's second check. Store both values in Supabase Vault or your scheduler's secret store, never in this repo or SQL committed to Git. Request body may be `{ "limit": 50 }`.

If using Supabase Cron + `pg_net`, store `project_url`, `service_role_key`, and `push_dispatch_secret` in Vault first, enable the `pg_cron`, `pg_net`, and Vault extensions in the project, then run `supabase/diagnostics/push-dispatch-cron.sql` as the `postgres` role. Verify job responses in `cron.job_run_details` and Edge Function logs; the script replaces an existing job with the same name.

## 4. Verify live behaviour

Use two test accounts and a supported HTTPS browser/device. Verify likes and comments queue only for another account, no push before the first 60 seconds, multiple same-group activities coalesce, a new event while a batch is processing enters a later batch, read notifications and newly blocked pairs don't deliver, and a worker retry doesn't re-send devices already recorded as delivered. Disable push on one device and verify only the caller's endpoint is removed. Force a test expired endpoint in a non-production environment and confirm HTTP 404/410 cleanup.

## Important feature boundary

The current repository has no follow table/action and no `comments.parent_comment_id` column or nested-reply UI. The migration attaches follow/reply generators only if a real database schema already has those exact columns/tables. So this package can deliver push for the app's existing likes/comments and supports optional reply/follow events once those product relationships exist; it does not claim the current app generates genuine follow events or nested reply notifications today.
