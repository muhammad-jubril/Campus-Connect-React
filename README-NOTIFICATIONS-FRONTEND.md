# Campus Connect notifications and Web Push

## Included in the current source

- Recipient-scoped notification reads, unread count, read/unread actions, and Supabase Realtime subscription in the existing app layout and bottom navigation.
- Client presentation grouping for likes and comments by post, replies by their comment/thread, and follows by UTC day. Grouping preserves the original notification row IDs; it does not write combined or synthetic rows to the database.
- User-initiated Web Push subscription controls using the app's existing VitePWA service worker (`public/push-sw.js` is imported into the generated worker, not registered independently).
- Forward migration `supabase/migrations/20261012120000_notifications_push_pipeline.sql` for private subscriptions, 60-second push batching, concurrency-safe pending group updates, retry metadata, delivery receipts, and optional hooks for real reply/follow relations where those exist.
- Supabase Edge Functions to register/remove a signed-in user's push subscription and to dispatch queued Web Push messages.
- Backend deployment instructions at `supabase/diagnostics/push-dispatch-setup.md` and a review report at `NOTIFICATIONS-AUDIT-REPORT.md`.

## Frontend integration handoff

The backend relationship migration now adds `comments.parent_comment_id` and `public.follows`, so the Notifications contract can support real reply/follow activities after deployment. The React UI still needs to wire those source actions:

- For a reply, send the parent comment ID as `parent_comment_id` with the existing comment insert. Leave it null for a top-level comment.
- For follow/unfollow, insert/delete `public.follows` rows. Insert only `following_id`; the backend derives `follower_id` from the signed-in session.
- Do not write to `public.notifications` in browser code. The database triggers generate all event rows and preserve their IDs.
- For reply notification rows, both `comment_id` and `thread_id` contain the root/top-level comment ID to match the current grouping helper. The source `comments.parent_comment_id` remains the immediate reply parent.

The backend code and static SQL dry-run are not proof of live delivery. The notification pipeline must be migrated, Edge Functions and secrets configured, the scheduler enabled, and a real HTTPS browser/device tested before push is called end-to-end working.

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
