# Campus Connect notifications and Web Push

## Included in the current source

- Recipient-scoped notification reads, unread count, read/unread actions, and Supabase Realtime subscription in the existing app layout and bottom navigation.
- Client presentation grouping for likes and comments by post, replies by their comment/thread, and follows by UTC day. Grouping preserves the original notification row IDs; it does not write combined or synthetic rows to the database.
- User-initiated Web Push subscription controls using the app's existing VitePWA service worker (`public/push-sw.js` is imported into the generated worker, not registered independently).
- Forward migration `supabase/migrations/20261012120000_notifications_push_pipeline.sql` for private subscriptions, 60-second push batching, concurrency-safe pending group updates, retry metadata, delivery receipts, and optional hooks for real reply/follow relations where those exist.
- Supabase Edge Functions to register/remove a signed-in user's push subscription and to dispatch queued Web Push messages.
- Backend deployment instructions at `supabase/diagnostics/push-dispatch-setup.md` and a review report at `NOTIFICATIONS-AUDIT-REPORT.md`.

## Important current-schema boundary

The repository's app code has only a post comments feature; the `comments` reads and writes have no `parent_comment_id`/nested-reply relationship. The checked-in project also has no follows table or follow/unfollow action. The migration only attaches those optional generators when a deployed database already has the required schema. As checked in, generated in-app events are likes and post comments, not real follow events or nested-comment replies.

The UI intentionally labels push not configured until both the public VAPID key and the authenticated subscription endpoint are set. A browser subscription alone never proves the server stored it, and no push delivery is claimed until the Edge Functions and scheduler are deployed and a device test succeeds.

## Deploy

1. Apply the notification pipeline migration in the already-initialized Supabase project.
2. Set Edge Function secrets described in `supabase/diagnostics/push-dispatch-setup.md`, deploy `push-subscriptions` and `dispatch-push-notifications`, and configure a one-minute scheduled caller for the dispatcher.
3. Set `VITE_WEB_PUSH_PUBLIC_KEY` and `VITE_PUSH_SUBSCRIPTION_ENDPOINT` in the frontend hosting environment, then rebuild/redeploy. The endpoint must be the `push-subscriptions` function on the configured Supabase project; the client rejects other hosts/paths before sending the user's access token.
4. Verify Realtime publication membership, RLS and column grants in the live Supabase project.
5. Test on supported HTTPS desktop/mobile browsers with two accounts. See the detailed setup checklist.

## Local quality checks

```sh
npm ci
npm test
npm run lint
npm run build
```

Some checks in the independent audit environment were blocked because package registry access failed; see `NOTIFICATIONS-AUDIT-REPORT.md` for exact outcomes and items not verifiable here.
