# Campus Connect Settings — backend integration contract

## Notification category preferences (migration included in this patch)

Apply `supabase/migrations/20261012180000_settings_notification_preferences.sql` after `supabase/migrations/20261012120000_notifications_push_pipeline.sql` in this source bundle (or the matching version already installed in your project) and before deploying the updated `dispatch-push-notifications` Edge Function. Deploy the updated `push-subscriptions` Edge Function as well: Settings uses its authenticated, read-only `GET ?endpoint=...` operation to verify whether the current browser subscription is actually registered for the signed-in user.

The app reads and updates `public.notification_preferences` through the signed-in Supabase client. The caller does not provide `user_id`; PostgreSQL defaults it from `auth.uid()`. The table contract is:

- `user_id uuid primary key references public.profiles(id) on delete cascade`
- `push_likes boolean not null default true`
- `push_comments boolean not null default true`
- `push_replies boolean not null default true`
- `push_follows boolean not null default true`
- `updated_at timestamptz not null default now()` (maintained by a trigger)

RLS permits a user to read/insert/update only their row. Column grants exclude `user_id` and `updated_at` from client writes. Existing users who already have push subscriptions are seeded with all categories enabled to preserve their current opted-in behaviour.

`supabase/functions/dispatch-push-notifications/index.ts` now checks the saved category preference immediately before delivery. Turning off a category suppresses only its Web Push delivery. The underlying `public.notifications` rows, unread counters and in-app history remain unchanged. Re-deploy this Edge Function after applying the migration.

The master switch in Settings controls the current browser/device subscription using the authenticated `push-subscriptions` Edge Function. The UI reports browser permission separately from a subscription confirmed against the backend. Status checks are read-only; opening Settings will not recreate a registration deleted server-side. If a local subscription exists but no server row matches, the UI marks it unregistered and rotates it only after the user explicitly turns push on. A device permission denial does not prevent removal of a local subscription that still exists.

## Account deletion endpoint (backend work still required)

The current repository does not contain a secure `delete-account` Edge Function. The Settings UI calls `supabase.functions.invoke("delete-account", ...)`, and it treats the operation as successful **only** if the deployed function returns `{ "status": "deleted" }`. A missing function, an error, or any other response leaves the user signed in and displays an error; the frontend does not delete profile/content tables or pretend a request succeeded.

The backend developer must implement/deploy this endpoint before account deletion can complete. Required contract:

1. Require and validate the caller's Supabase access token server-side; derive the account ID from the verified identity, never from request JSON.
2. Require recent authentication or reauthentication for this destructive action.
3. Execute the approved content cleanup/anonymization, storage cleanup, and auth-user deletion workflow on the server. Respect Marketplace `ON DELETE RESTRICT`, reporter identity/retention rules, legal/safety records, foreign keys and push subscriptions. Do not blindly delete tables from browser code.
4. Return `{ "status": "deleted" }` only after the irreversible deletion workflow is committed. Return a non-2xx error for failures; do not return this status for a queued or partial request.
5. Ensure a repeated request is handled safely, and avoid exposing service-role credentials to the frontend.

No deletion Edge Function or production deletion policy has been fabricated in this frontend patch. Until the endpoint is deployed and verified, Settings will say that completion could not be confirmed.

## Frontend verification boundary

Repository tests can check the client contract and migration source. They cannot prove live RLS, remote migration application, Edge Function deployment, browser permission prompts or actual push delivery. Those still need validation in the configured Supabase project and on a supported HTTPS browser/device.
