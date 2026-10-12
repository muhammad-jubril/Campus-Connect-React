# Campus Connect Notifications — backend deployment runbook

## What this backend adds

- Forward-only schema migration on the existing `public.notifications` table; no activity or profile rows are intentionally deleted.
- `parent_comment_id` on comments, root thread identity in notification rows, and a new `follows` relation table.
- Backend notification triggers for likes, comments, replies, and follows; trigger idempotency uses source activity IDs.
- Recipient-only notification SELECT, read-only UPDATE privileges, and no direct authenticated notification INSERT.
- Realtime publication for `public.notifications`.
- Private push-subscription storage, per-target/type quiet-window state, outbox, and per-device retry state.
- JWT-authenticated subscription registration/removal and a server-side Web Push worker.

## Migrations

Apply these in timestamp order after reviewing the diff:

1. `supabase/migrations/20261012130000_notifications_backend.sql`
2. `supabase/migrations/20261012130001_notifications_delivery_retry_hardening.sql`

They were validated against the current project's Postgres by running both inside a transaction followed by ROLLBACK; that verifies SQL execution without applying the schema. The migration still needs to be applied to the intended database as part of the deployment, then verified using migration history and schema queries.

## Edge Function deployment

The existing project ref is `annmbmuuiqvutgvvkpet`.

Deploy the user-facing subscription endpoint with JWT verification enabled:

```bash
supabase functions deploy push-subscriptions
```

Deploy the dispatcher only after the migration is applied. It uses a purpose-built shared-secret header rather than an end-user JWT, so the platform's automatic JWT gate must be off for this endpoint; the handler rejects requests without `x-internal-push-secret`:

```bash
supabase functions deploy deliver-notification-push --no-verify-jwt
```

Set Edge Function secrets securely (not in source control or Vercel's client-exposed bundle):

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="<public VAPID key>" \
  VAPID_PRIVATE_KEY="<private VAPID key>" \
  VAPID_SUBJECT="mailto:admin@example.com" \
  NOTIFICATION_PUSH_INTERNAL_SECRET="<random secret at least 32 characters>" \
  PUSH_ALLOWED_ORIGINS="https://<production-origin>,https://<approved-preview-origin>,http://localhost:5173"
```

Supabase normally injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into the hosted function runtime. Confirm these reserved values are present in the function environment and **never** expose the service-role value to Vite.

Generate one VAPID keypair using a trusted Web Push key generator (for example the Web Push CLI's `generate-vapid-keys` command). Keep the private key server-side and use only the public key in the browser.

## Vercel frontend configuration

Set these variables in Vercel for every environment where push will be tested, then redeploy:

```text
VITE_WEB_PUSH_PUBLIC_KEY=<public VAPID key>
VITE_PUSH_SUBSCRIPTION_ENDPOINT=https://annmbmuuiqvutgvvkpet.supabase.co/functions/v1/push-subscriptions
```

The Edge Function's `PUSH_ALLOWED_ORIGINS` must include each exact origin used by the app. Preview deployments use distinct origins; only add origins you control. Local Vite development normally runs at `http://localhost:5173`.

## Securely configure the database dispatcher

The migration schedules the Edge Function once per minute and makes the job a no-op until the two named Vault secrets exist. Generate a random string at least 32 characters long and set the same value as `NOTIFICATION_PUSH_INTERNAL_SECRET` in the Edge Function and as the Vault secret below. Do not commit the actual value in a SQL file.

From the Supabase SQL editor (substitute real values in the editor; never commit them):

```sql
select vault.create_secret(
  'https://annmbmuuiqvutgvvkpet.supabase.co',
  'campus_connect_project_url'
);

select vault.create_secret(
  '<same random secret as NOTIFICATION_PUSH_INTERNAL_SECRET>',
  'campus_connect_notification_push_secret'
);
```

The scheduled job only calls the delivery endpoint; the shared-secret check prevents an unauthenticated caller from processing the outbox. Verify its status via `cron.job` and `cron.job_run_details`. Rotate the shared value in both places together if it ever leaks.

To disable push without disabling in-app notifications, run:

```sql
update public.notification_push_config
set enabled = false, updated_at = now()
where singleton = true;
```

Re-enable it by setting `enabled = true`. Adjust `quiet_window_seconds` between 1 and 3600 seconds; default is 60.

## Verification checklist

### SQL/schema
- Confirm migration history contains both notification migrations.
- Confirm `public.notifications` allows SELECT only for the recipient and UPDATE of only `read`; authenticated users have no INSERT privilege.
- Confirm `public.notifications` is present in `pg_publication_tables` under `supabase_realtime`.
- With two test users, verify like, top-level comment, nested reply, follow, self-notification prevention, and bilateral block suppression. Test read/unread across sessions.
- Concurrently insert repeated same-target activity and assert all activity/notification rows persist while only one push-outbox record is admitted per recipient/type/target per 60-second window.
- Verify each registered device gets its own delivery row; 404/410 marks/removes an expired endpoint; temporary HTTP failures retry; hard failures become terminal after the retry budget.

### Build/CI versus real push
- Repository CI and build/lint/test output verify code and static contracts only.
- A live subscription test needs an authenticated browser over HTTPS and notification permission.
- A real delivery test must confirm a provider 2xx, then observe a notification on an actual browser/device and exercise the click path. Do not call it end-to-end verified until that has happened.

## Known operational limitation

A push service can accept a request while its response is lost. Retries may therefore send a duplicate transport request in that rare case. The delivery claims are concurrency-safe and use a stable visible-notification tag, but Web Push does not expose a transactional exactly-once receipt from the device. The in-app notification remains durable independently of push outcomes.
