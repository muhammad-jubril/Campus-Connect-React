# Campus Connect Settings — independent audit report

## Findings

| Evidence label | Finding |
|---|---|
| **Verified in current repository** | The `/settings` route and existing drawer entry are retained. Existing links to profile editing, blocked accounts, privacy policy, and terms remain available. |
| **Verified in current repository** | `notification_preferences` has own-row RLS policies, `auth.uid()` ownership defaults/checks, boolean-only client insert/update grants, and a database-maintained `updated_at`. The client service validates allowed fields and boolean values. |
| **Verified in current repository** | The dispatcher maps like/comment/reply/follow to saved category fields and suppresses the Web Push delivery when the matching field is `false`; it does not delete the `public.notifications` row. Missing preference rows default to delivery enabled, preserving older push registrations. |
| **Verified in current repository** | The authenticated `push-subscriptions` function derives user identity from `auth.getUser(bearerToken)` and filters subscription status by both the verified user ID and endpoint. It never accepts a client-supplied user ID. RLS/column grants on preferences prevent normal clients from changing another account's row. |
| **Verified in current repository** | There is no `supabase/functions/delete-account` source implementation. Marketplace listing ownership and content/marketplace report reporter foreign keys use `ON DELETE RESTRICT`; report-retention semantics therefore must be handled explicitly by a server-side deletion policy. |
| **Verified in current repository** | The profile frontend calls five follow RPCs, but the corresponding migration was on an open PR and missing from `main`. This audit ZIP adds the migration to align the checked-in migrations with the RPC-based frontend. It has not been applied to Supabase here. |
| **Verified through runtime testing** | `npm test`: **84 passed, 0 failed**. These are automated Node tests, many of which assert source contracts; they are not an authenticated browser/Supabase integration suite. |
| **Verified through runtime testing** | TypeScript's transpile/parser pass completed for **180 JS/JSX/TS/TSX/MJS files** with **0 syntax diagnostics**. This is a syntax check, not a complete typecheck/build. |
| **Not verifiable in the available environment** | `npm run build` and `npm run lint` could not run because `vite` and `eslint` are not installed. The offline dependency cache is incomplete and package-registry networking is unavailable. No browser automation runtime or live Supabase credentials were available. |
| **Not verifiable in the available environment** | Whether the migrations are applied in the intended Supabase project, actual live RLS/Storage grants, real Web Push delivery/expiry behavior, cross-account probes, server session revocation, or a completed account deletion workflow. No direct live-Supabase verification is claimed. |

## Confirmed fixes in this ZIP

1. **Push-status reads no longer mutate subscription state.** Opening or refreshing Settings now calls an authenticated, read-only `GET ?endpoint=...` operation on `push-subscriptions`. A local subscription missing on the server is presented as unregistered and is only rotated after an explicit user enable action. This avoids silently re-registering an endpoint after a user turned push off or the backend removed an expired subscription.
2. **Account deletion stays disabled until a safe backend exists.** The confirmation and guarded server-response contract remain in source, but the destructive action is deliberately gated off because the Edge Function and approved hybrid cleanup/retention implementation are absent. The UI says why it is unavailable instead of implying this build can complete deletion.
3. **Profile RPC migration source is included.** The migration defining `follow_student`, `unfollow_student`, `get_follow_counts`, `get_followers`, and `get_following` now ships with the profile frontend that calls them. Live schema state remains unverified.

## Account deletion: blocking work before enablement

A deletion endpoint must verify the bearer token, derive the user ID only from the verified identity, require recent authentication/reauthentication, and implement a documented hybrid policy for profiles, posts, comments, marketplace listings, follows, notifications, push subscriptions, and Storage objects. It must explicitly handle Marketplace seller rows and retained reports that restrict profile deletion. The backend must make partial failure/retry behavior idempotent and safe, report `status: "deleted"` only after the full workflow commits, and revoke/invalidate the account session. The present repository cannot demonstrate these guarantees, so this action is not enabled and deletion is **not complete**.

## Recommendation / deployment checklist

1. Apply the migrations in timestamp order in a staging Supabase project, including the newly included follow RPC migration and the Settings preference migration. Verify recorded migration versions, function signatures/privileges, preferences RLS from two test users, and storage policies directly in that project.
2. Deploy both updated Edge Functions: `push-subscriptions` (authenticated GET status check) and `dispatch-push-notifications` (server-enforced category filtering). Confirm allowed origins and the existing Supabase/VAPID/dispatcher secrets. Never place service-role or VAPID private keys in client `VITE_*` variables.
3. On supported HTTPS browsers, test each category, per-device master on/off, denied permission with an existing local subscription, backend-missing subscriptions, 404/410 expired endpoints, service-worker-not-ready, network failure and retry paths. Confirm in-app notifications still appear when push categories are off.
4. Agree the exact hybrid deletion/retention policy, implement the server workflow, exercise failure injection and retry tests in staging, then audit it independently before enabling `ACCOUNT_DELETION_BACKEND_READY`.
