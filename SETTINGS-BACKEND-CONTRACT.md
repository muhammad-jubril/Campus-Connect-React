# Campus Connect Settings — backend integration contract

This contract describes the implementation in this branch and records the three live migrations applied to Supabase: `20261012180000_settings_notification_preferences`, `20261012180500_notification_preferences_master_push`, and `settings_account_deletion_backend` (live migration version `20261012203901`), plus the reviewer-redaction correction in `account_deletion_reviewer_redaction`. Account deletion must remain unavailable in the UI until a successful end-to-end test in an approved disposable test account has completed.

## Notification preferences

Apply these migrations in order after the existing notification push pipeline:
1. `supabase/migrations/20261012180000_settings_notification_preferences.sql`
2. `supabase/migrations/20261012180500_notification_preferences_master_push.sql`

Then deploy `supabase/functions/dispatch-push-notifications/index.ts` from this branch. It preserves the Vault-backed VAPID/dispatch-secret contract and rechecks the saved account master and category values immediately before sending.

`public.notification_preferences` is the one persistent per-account preferences table:

- `user_id uuid primary key references public.profiles(id) on delete cascade`; derived from `auth.uid()`
- `push_enabled boolean not null default true`; account-wide master switch
- `push_likes boolean not null default true`
- `push_comments boolean not null default true`
- `push_replies boolean not null default true`
- `push_follows boolean not null default true`
- `updated_at timestamptz not null default now()`; maintained in the database

RLS permits each account to read/insert/update only its own row. Client column grants exclude `user_id` and `updated_at`. Existing users already having saved browser/device subscriptions are seeded with enabled category defaults by the category migration, preserving their opted-in behavior. New preferences default to true, but browser permission and a server-confirmed device subscription remain separate states.

Client service contract:
- `loadNotificationPreferences(userId)` reads or creates a default row; it omits `user_id` from client INSERT and PostgreSQL derives it from `auth.uid()`.
- `updateNotificationPreference(userId, "push_enabled" | "push_likes" | "push_comments" | "push_replies" | "push_follows", boolean)` persists the chosen boolean.
- The frontend must expose the account-wide `push_enabled` setting separately from the existing per-device subscription switch. The account master switch must not silently unregister the device; the device switch controls that browser subscription only.
- After a successful write, refresh preferences from Supabase (or use the returned saved row). Settings must not claim a persisted change if the request failed.

The trusted dispatcher maps `like`, `comment`, `reply`, and `follow` to their category columns. It skips push if `push_enabled=false` or the mapped category is false. This only finishes/suppresses the push queue entry: it does not delete or mutate `public.notifications`, read state, counts, or underlying activity. Missing preference rows use the legacy-compatible defaults (enabled).

## Account deletion hybrid policy

Migration: `supabase/migrations/20261012195000_settings_account_deletion_backend.sql`, `supabase/migrations/20261012210000_account_deletion_reviewer_redaction.sql`, and `supabase/migrations/20261012211000_account_deletion_target_reference_cleanup.sql`.
Edge Function: `supabase/functions/delete-account/index.ts`.

The function uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from its trusted server environment. Never place the service-role key in Vite variables or the client. Deploy with JWT verification enabled. A separate 256-bit worker secret is generated into Supabase Vault by the migration. The one-minute push scheduler and its Vault secret are unchanged.

### User-initiated request

The browser calls `supabase.functions.invoke("delete-account", { body: { confirmation: "DELETE_MY_ACCOUNT" } })`. It MUST NOT send an account ID. The function validates the bearer token with `auth.getUser(token)` and derives the only account ID from that verified user. It requires `last_sign_in_at` to be within the preceding 10 minutes; on HTTP 428 / `reauthentication_required`, the frontend should ask the user to sign in again (or reauthenticate using its configured method) and retry. The server also requires the fixed confirmation value.

Response meanings:
- `200 { "status": "deleted" }`: only after Auth deletion succeeded or the Auth API explicitly reported the user was already absent and a second lookup confirmed absence, followed by the job completion write.
- `202 { "status": "pending" }` / `503 { "status": "pending" }`: incomplete. The user must NOT be shown a success state; the server retries using its private recovery job.
- `202 { "status": "disabled" }`: after 30 days of failed hard-delete attempts, the function requests Supabase Auth's irreversible soft-delete mode. Supabase documents that soft-deleted Auth users retain only a hashed user identifier and cannot be restored. This is reported distinctly as `disabled`, not as full hard deletion; the deletion job clears the live user ID and is purged after 30 days. The frontend should clear local session and show a clear partial/soft-deletion message, never a success state.

### Deletion sequence and recoverability

1. Create/claim a per-user private job under an advisory lock; repeat requests attach to the existing job.
2. In one Postgres transaction, redact reports with a retention deadline, clear profile/listing target references for deleted targets, remove affected pending push batches before dependent posts/comments cascade, and remove the account's listings, authored comments/posts, likes, post views, follow edges, blocks, hidden-post rows, device subscriptions, delivery receipts, notifications, and profile. Existing foreign keys cascade where intended. No app data is removed before explicit authenticated confirmation.
3. Remove objects from the user's UUID folder in only `avatars`, `post-media`, and `marketplace-images`. A database reference-check protects any URL/path still used by another surviving account, listing, post, or live report. Shared objects are queued and rechecked by a scheduled worker; transient Storage failures leave a retryable job and never return `deleted`.
4. Call Supabase Auth Admin to delete the user (which cascades auth sessions and identities). If Auth hard deletion is already done but the final job write failed, a second Auth lookup verifies absence before completion.
5. The migration adds a restrictive RLS policy based on an active `auth.users` + `public.profiles` row to app tables and Storage. This blocks normal authenticated table/Storage access from an old still-unexpired stateless access JWT as soon as the profile is gone; Auth deletion also revokes refresh sessions. The frontend clears local session only after the server reports `deleted`.

Recovery cron calls `delete-account` every five minutes with the Vault worker secret and authenticated gateway headers; retries are idempotent. A per-run claim/lock prevents concurrent workers. Safe database cleanup rolls back atomically on error; Storage and Auth operations are outside that transaction and are handled by persisted phases. Errors are stored as non-PII codes, not raw requests/emails.

### Moderation retention (finite exception)

Reports involving the departing account are not left with the person's name, profile, authored excerpts, image evidence or free text when the report targets the departing account/content. Report rows retain only limited fields such as reason, status, created/review timestamps, and opaque target identifiers for safety review/appeal history. Reports filed by the departing account against someone else are retained temporarily with reporter identity and free-text removed, so the target’s own submitted evidence can still be reviewed.

All report rows touched by the account receive `deletion_anonymized_at` and `retention_expires_at = now() + 180 days`; a daily database maintenance job deletes those rows once expired. The private job record has no user ID after hard deletion, stores only phase/attempt/error-code metadata, and is purged 30 days after completion. Media reference records also expire after 180 days; shared objects are retained only while an active surviving record still references them (and are removed by the worker once that reference disappears).

### Live verification boundary

Do not enable the deletion button until all of these are verified in a non-production test account: fresh-auth requirement, cross-account rejection, full cleanup, all three storage buckets, report redaction/expiry, auth sessions, stale JWT RLS guard, partial-failure recovery, repeated requests, and the exact server response semantics. Production deployment of the migration/Edge Function alone does not prove a complete deletion flow.
