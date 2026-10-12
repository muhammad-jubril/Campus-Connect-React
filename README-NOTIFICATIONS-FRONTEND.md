# Notifications frontend patch

## What's included
- Real Notifications route replacing the placeholder.
- Grouped like/comment/reply/follow presentation while preserving and exposing individual activity rows.
- Individual, group, and all-as-read actions with the current `notifications` table.
- Recipient-scoped Supabase Realtime subscription and live unread count in the existing bottom navigation.
- Mobile/desktop styling matching Campus Connect's existing green/ink/surface variables.
- A user-controlled push panel with actual browser permission and PushManager checks, explicit unsupported/not-configured/error states, and backend confirmation before claiming push is enabled.
- Notification-click navigation added by importing `public/push-sw.js` into the existing generated VitePWA service worker. It does not register a second worker.
- Grouping tests and a backend contract note.

## Apply
Extract into the project root, preserving the included paths. Existing files are replacements; new files should be added. No SQL migration is included because the task assigns database schema, generation, security, and push delivery to the backend developer.

## Run locally
```bash
npm run build
npm run lint
npm test
node --test tests/notification-grouping.test.js
```

## Backend setup still required
Review `NOTIFICATIONS-BACKEND-CONTRACT.md` with the backend developer. The repository's existing notification migration currently supports only `like` and `comment`; replies/follows need backend-generated rows and suitable real target fields. Supabase Realtime must be enabled for `public.notifications`. Push is intentionally shown as not configured until both frontend environment variables and the authenticated backend endpoint are available.

## Manual browser test
1. Log in as the recipient and navigate to Notifications.
2. Generate a like/comment from another test account. Confirm the badge changes without reloading.
3. Generate multiple likes for one post and confirm they group, then expand and mark just one underlying activity as read.
4. Mark a group as read and use Mark all as read. Confirm the unread badge updates.
5. Confirm comments navigate to `/post/:id#comments` and follows to `/profile/:username`.
6. With push config absent, confirm the UI clearly says not configured and never claims enablement. With a backend deployed, exercise permission, subscribe, disable, and push-click navigation on a secure origin.

## Suggested commit message

```text
feat(notifications): add grouped activity and push controls
```
