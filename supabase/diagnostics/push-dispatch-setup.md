# Web Push deployment checklist

The backend stores VAPID credentials and its dispatch secret in Supabase Vault. Actual delivery additionally requires the deployed dispatcher and scheduled caller. The dispatcher retrieves VAPID material through a service-role-only, dispatch-secret-guarded RPC. Never commit VAPID private keys, dispatch secrets, service-role keys, or real Vault values, and never put the VAPID private key or any secret in `VITE_*`. Never put this in `VITE_*`, even in deployment examples.

## 1. Migration order

Apply these migrations in order using the repository's established Supabase migration workflow, only for a project that already has the Campus Connect base schema:

1. `supabase/migrations/20261012140537_notifications_push_pipeline.sql` — the existing queue, subscriptions, receipts, retry handling and quiet-window queue infrastructure.
2. `supabase/migrations/20261012140543_notifications_relationships.sql` — reply-parent and follow relationships, server-generated notification targets and quiet-window settings.
3. `supabase/migrations/20261012151410_install_push_dispatch_extensions.sql` — enables `pg_cron` and `pg_net`.
4. `supabase/migrations/20261012151542_notification_push_vault_runtime_access.sql` — creates the initial service-role-only Vault runtime reader and the queue target index.
5. `supabase/migrations/20261012151640_notification_push_vault_guarded_runtime_config.sql` — replaces that reader with the guarded function that verifies the supplied dispatch secret before returning VAPID material.
6. `supabase/migrations/20261012170749_follow_operations_and_profile_queries.sql` — adds idempotent follow/unfollow RPCs, block-aware follower/following lists and counts, and restricts direct client mutation of the existing `public.follows` table. It reuses the existing follow notification trigger.
7. `supabase/migrations/20261012203746_settings_notification_preferences.sql` — persists per-account push categories.
8. `supabase/migrations/20261012203752_notification_preferences_master_push.sql` — adds the account-wide master switch; device/browser subscription state remains separate.

These forward-only migrations do not delete existing notification, like, or comment data.

## 2. Required Supabase Vault entries

Use Vault for these entries; the actual secret values are environment-specific and must never be committed:

- `campus_connect_project_url`: the project's HTTPS API URL.
- `campus_connect_anon_jwt`: the project's legacy anon JWT key. The scheduled caller uses it as `apikey` and as `Authorization: Bearer ...` to pass the Edge Function gateway's JWT verification.
- `campus_connect_push_dispatch_secret`: a random secret of at least 32 characters.
- `VAPID_PUBLIC_KEY` → `campus_connect_vapid_public_key`: the public half of the VAPID pair.
- `VAPID_PRIVATE_KEY` → `campus_connect_vapid_private_key`: matching private half; never expose it to the browser.
- `VAPID_SUBJECT` → `campus_connect_vapid_subject`: a valid `https://...` or `mailto:...` contact URI.
- `PUSH_DISPATCH_SECRET` → `campus_connect_push_dispatch_secret`: shared only by the Vault check and scheduled caller.

The live Campus Connect project has all six named entries. The private key and dispatch secret are not included in browser variables or this repository.

## 3. Edge Functions and frontend environment

The `push-subscriptions` and `dispatch-push-notifications` functions must remain deployed with JWT verification enabled. Supabase provides its default `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` runtime values to these functions; do not copy the service-role key to Vite.

The frontend needs these public settings in Vercel, followed by a fresh build/deployment:

```text
VITE_WEB_PUSH_PUBLIC_KEY=<exact value of campus_connect_vapid_public_key in Vault>
VITE_PUSH_SUBSCRIPTION_ENDPOINT=https://<project-ref>.supabase.co/functions/v1/push-subscriptions
```

The public VAPID key in Vercel must match the private key stored in Vault. Never put the private key in a `VITE_*` variable. If using a production origin outside the function's current allow-list, set `ALLOWED_ORIGINS` for `push-subscriptions` to a comma-separated list of the exact HTTPS origins you control.

## 4. One-minute dispatcher schedule

The live project has a Cron job named `campus-connect-push-dispatch`, scheduled every minute. To recreate/repair it, run `supabase/diagnostics/push-dispatch-cron.sql` as the `postgres` role after the Vault entries exist. The script replaces the job with the same name.

The scheduled caller sends:
- `apikey` and `Authorization: Bearer ...` using `campus_connect_anon_jwt` for the function gateway.
- `x-push-dispatch-secret` using `campus_connect_push_dispatch_secret` for the worker's independent validation.
- A body such as `{"limit":50}`.

The VAPID private key is not sent as a request header and is not stored as an Edge Function secret. The worker validates the dispatch header against Vault through a restricted RPC, then reads the VAPID pair only after validation.

Verify the job in `cron.job`, its history in `cron.job_run_details`, HTTP results in `net._http_response`, and function logs. A successful job invocation with `claimed: 0` shows the path is responding but does not demonstrate delivery to a device.

## 5. Quiet window and safe activation

The connected Campus Connect project currently has `enabled = true` and `quiet_window_seconds = 60`; the active one-minute Cron job and Vault secret names were confirmed by read-only checks. This review did not independently verify a fresh real-device delivery, so verify provider receipts and a browser/device test before describing push as end-to-end validated. For a new environment, keep push disabled until the secrets, Edge Functions, scheduler, persisted subscription and real-device delivery test are complete. In-app notification rows are independent of push. The first event fixes its batch deadline; later events join the pending group without moving that deadline. The quiet window accepts 1–3600 seconds.

Do not enable push until a supported HTTPS browser has a persisted subscription and a real-device test confirms receipt and correct click navigation. Once tested, enable it explicitly:

```sql
update public.notification_push_config
set enabled = true, updated_at = now()
where singleton = true;
```

## 6. End-to-end test checklist

Use two test accounts and at least one supported HTTPS browser/device:

- A signed-in recipient can persist a subscription through `push-subscriptions` using both the user's Supabase access token and `apikey`.
- A like/comment creates an in-app notification and push queue entry only when push is enabled.
- The scheduled dispatcher returns success with correct secrets and rejects a wrong dispatch secret with HTTP 401.
- A real push arrives after the 60-second window and opens the correct destination when clicked.
- Multiple devices can register; unsubscribe removes only the caller's endpoint.
- Read notifications, blocked pairs and hidden targets are suppressed by the dispatcher.
- Provider HTTP 404/410 removes the expired endpoint.
- A retry skips devices whose delivery receipts are already marked delivered.

## 7. Frontend relationship integration

The backend accepts replies by setting `comments.parent_comment_id` for replies (null for top-level comments) and follows by writing only `following_id` to `public.follows`; the database derives the follower from the authenticated session. The frontend agent must wire these existing contracts and must never insert directly into `public.notifications`.
