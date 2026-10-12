# Campus Connect Notifications — shared frontend/backend data contract

This is the canonical integration contract for the beta. It uses the existing `public.notifications` table and retains one row per underlying activity. The backend creates rows from database triggers; the browser must never insert notifications directly.

## Notification row shape

`public.notifications` provides:

| Field | Meaning |
| --- | --- |
| `id` | Notification row ID; use this for read-state operations |
| `recipient_id` | Authenticated owner of this notification; server-derived by the trigger |
| `actor_id` | User who performed the activity; server-derived from the source row |
| `type` | Canonical enum-like text: `like`, `comment`, `reply`, `follow` |
| `post_id` | Post target for likes, comments, and replies; null for follows |
| `comment_id` | For a reply, the immediate parent comment ID |
| `thread_id` | For a reply, the top-level comment ID anchoring the full reply thread |
| `profile_id` | For a follow, the profile being followed (normally the recipient) |
| `source_id` | ID of the underlying action row: `likes.activity_id`, `comments.id`, or `follows.id`; used for trigger idempotency |
| `read` | Persistent recipient read/unread flag |
| `created_at` | Time of the underlying action |

Actor display data is resolved from `public.profiles(id, username, name, avatar_url)`. The actor profile may be absent from a response when current block/privacy rules prevent it from being read.

## Source activity contract

- **Like:** Insert into `public.likes` using the authenticated user's ID as `user_id` and the target post ID. The database assigns a unique `activity_id` for each new like row. An unlike followed by a later re-like generates a distinct event.
- **Top-level comment:** Insert into `public.comments(post_id, author_id, text)`; `parent_comment_id` is null.
- **Reply:** Insert into `public.comments(post_id, author_id, text, parent_comment_id)`. The parent must exist on the same post. Use `parent_comment_id` as the immediate reply target; backend traversal resolves `thread_id` to the thread's top-level comment.
- **Follow:** Insert into `public.follows(followed_id)`. Do not provide `follower_id`; the database default obtains it from `auth.uid()`. Self-follows and bilateral blocks are rejected.
- Do not insert into `public.notifications` from client code. Trigger logic owns actor, recipient, type, target and source identity.

## Grouping rules

Grouping is a presentation concern and never merges/deletes database rows:

- Likes: `type + post_id`.
- Top-level comments: `type + post_id`.
- Replies: `type + thread_id` (the root comment ID, not the immediate parent).
- Follows: recent follows are grouped in the UI by calendar day.
- Read operations still target underlying notification `id` values, so one row, one group, or all rows can be marked as read accurately.

## Read-state and security

The frontend can select only notifications where `recipient_id = auth.uid()`. Its only allowed notification update is the `read` column on its own rows. Authenticated users do not have notification INSERT privileges. Avoid any API/RPC that accepts caller-provided actor or recipient IDs as authority.

## Realtime

The backend adds `public.notifications` to `supabase_realtime`. Subscribe to `postgres_changes` for `public.notifications` with `filter: recipient_id=eq.<authenticated-user-id>`; refresh the list and unread count after each event. RLS remains the data boundary. If Realtime fails, expose that state and retain manual refresh.

## Push-subscription contract

The subscription endpoint is:

`https://annmbmuuiqvutgvvkpet.supabase.co/functions/v1/push-subscriptions`

Configure the frontend with:
- `VITE_WEB_PUSH_PUBLIC_KEY`: public VAPID key only.
- `VITE_PUSH_SUBSCRIPTION_ENDPOINT`: the endpoint URL above.

All methods require `Authorization: Bearer <Supabase access token>`. The backend validates the JWT and derives the user ID from it.

- `POST`: `{ "subscription": PushSubscriptionJSON }` to register a new subscription.
- `PUT`: same body to idempotently synchronize an existing subscription.
- `DELETE`: `{ "endpoint": "<browser endpoint>" }` to remove only the calling user's subscription.

A 2xx response means the server persistence action succeeded. A browser-local subscription by itself does not mean backend push is enabled. Service role keys and VAPID private keys must never be sent to Vite or the browser.

## Push quiet window and delivery contract

`public.notification_push_config` controls push availability and the configurable quiet window. The initial value is 60 seconds. To change it in the Supabase SQL editor, use for example:

```sql
update public.notification_push_config
set quiet_window_seconds = 60, updated_at = now()
where singleton = true;
```

The concurrency-safe window key is `recipient_id + notification type + target key`: post for like/comment, root thread for reply, and recipient profile for follow. The first event when the window is eligible queues an outbox row; activity during the quiet window still persists as an individual in-app notification but does not queue another push. A later event after the window expires can queue the next push.

The private outbox/delivery tables support multiple devices, retry state, expired endpoints, and idempotent claims. A push-provider timeout can be ambiguous: transport-level delivery is at-least-once, while stable Web Push tags help the OS replace an existing visible alert. This is not a claim of mathematically exactly-once delivery.

## Push destinations

Payload `data.url` contains a same-origin application path:
- like: `/post/:postId`
- comment/reply: `/post/:postId#comments`
- follow: `/profile/:actorUsername`
- fallback: `/notifications`

VitePWA owns the service-worker registration. `public/push-sw.js` must stay imported by the generated worker via `workbox.importScripts`; do not register a second worker.

## Compatibility note for the frontend agent

The Notifications UI already groups from `select("*")`, supports underlying row IDs for read operations, and understands `comment_id`, `thread_id`, and `profile_id`. The existing comment composer should pass `parent_comment_id` only for replies. The follow UI should call `follows` with only `followed_id`. The database generates notifications in response to those operations; the UI should not create its own notification rows.
