# Campus Connect Settings — audit and implementation report

## Source inspected

The audit used the current GitHub `main` source containing `feat(settings): add persisted notification preferences and account controls` (`65feac8c3955f3e2a4b31a85c81a3b7a719ba212`) and independently inspected the relevant notification migrations, Edge Functions, Settings UI, and current follow frontend/backend contracts.

## Settings behavior and scoped fixes

- Preserved `/settings` routing and the existing hamburger-menu placement, plus links for profile editing, blocked accounts, privacy policy, and terms.
- Push category preferences are saved to `public.notification_preferences`; the included migration restricts client row access to `auth.uid()` and grants only the preference boolean columns for insert/update. The dispatcher suppresses Web Push for an explicitly disabled category without deleting the underlying in-app notification rows.
- **Audit fix:** push status checks previously re-registered a local push subscription as a side effect, which could undo a server-side unsubscribe/expired registration during Settings refresh. Status is now read-only through an authenticated, user-filtered GET endpoint. An unregistered local subscription can be replaced only after an explicit user enable action. The updated `push-subscriptions` Edge Function must be deployed with this client.
- **Audit fix:** account deletion is now explicitly gated off in the UI. There is no `supabase/functions/delete-account` implementation in this repository, so enabling its confirmation button would suggest a destructive workflow that this source cannot provide. The client-side invoke/response validation remains defensive for when the endpoint is implemented.
- **Audit fix:** included `supabase/migrations/20261012170749_follow_operations_and_profile_queries.sql`, matching the current profile frontend's five RPC calls. The main branch frontend referenced those RPCs, but the corresponding migration was only in the still-open PR #5, making the checked-in migrations inconsistent for a clean setup.

## Account deletion is not complete

Real deletion remains blocked on a concrete approved hybrid cleanup/retention policy and a secure server-side endpoint. Existing foreign keys restrict deleting profiles while marketplace listings/reports or content reports refer to them. A correct workflow must decide which records/media are deleted versus anonymized/retained, handle object storage, comments/posts/follows/notifications/push subscriptions, reauthentication, idempotent retries and partial failures, then delete the authenticated user only once database cleanup is safely committed. This audit did not fabricate that policy or implement a risky best-effort browser-side deletion.

## Evidence and verification

- **Verified in current repository:** Settings route/menu, preference-table grants/RLS source, server dispatcher preference check, authenticated subscription endpoint, destructive-action guard, missing deletion function, Marketplace/report foreign-key restrictions, and follow frontend/backend migration mismatch.
- **Verified through runtime testing:** `npm test` — see terminal audit results; tests assert source contracts and regression cases, not live Supabase behavior.
- **Verified against live Supabase:** Not verified in this environment. No live database or project credentials were available through the tools used for this audit.
- **Not verifiable in the available environment:** actual deployed migrations/RLS/Storage policies, browser push permission prompts, real device subscription delivery/expiry, or complete account deletion and retries.

The JavaScript build and ESLint commands could not be run successfully in this environment because `vite` and `eslint` are not installed. Attempting an offline dependency install fails because required packages are not cached, and package-registry networking is unavailable.

## Required deployment/configuration steps

1. Apply the follow RPC migration after `20261012170000_profile_following_backend.sql`, then apply `20261012180000_settings_notification_preferences.sql` after the push-pipeline migration. Verify database migration history and actual function privileges in the intended Supabase project.
2. Deploy both updated Edge Functions: `push-subscriptions` (read-only authenticated GET status check) and `dispatch-push-notifications` (server-enforced saved category preferences). Ensure the existing `SUPABASE_URL`, anon key, service-role key, dispatcher secret, VAPID and allowed-origin configuration are correct. Never place service-role or VAPID private keys in `VITE_*` variables.
3. Verify with two real authenticated test users that one user cannot read/change the other user's preference row or subscription; exercise all push categories; and test unsupported browsers, permission denial, expired endpoints, unsubscribe failures and refresh/retry behavior on HTTPS.
4. Agree and document the hybrid account-deletion and retention policy, implement/deploy `delete-account` with verified caller identity and recent reauthentication, then test failure injection, retry/idempotency, foreign-key handling, storage object removal and session invalidation in staging before enabling `ACCOUNT_DELETION_BACKEND_READY`.
