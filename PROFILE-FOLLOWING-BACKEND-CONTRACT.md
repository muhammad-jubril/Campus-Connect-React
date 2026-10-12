# Campus Connect — followers/following RPC contract

## Current integration target

The frontend is aligned with the backend relationship API in PR #5. It must not write directly to `public.follows`: the backend revokes authenticated INSERT/DELETE privileges and exposes authenticated RPCs that derive the acting user from `auth.uid()`.

Apply `supabase/migrations/20261012170749_follow_operations_and_profile_queries.sql` from `feat/notifications-relationship-backend` after the notification relationship migration. Confirm the PR's migrations are applied and the corresponding functions are present before expecting these clients to work.

## Supported RPCs

| Action | RPC and arguments | Return value |
|---|---|---|
| Follow | `follow_student({ p_following_id })` | `true` only when a new relationship was created; `false` if it already existed |
| Unfollow | `unfollow_student({ p_following_id })` | `true` only when the caller's outgoing relationship was removed; `false` if nothing was removed |
| Counts and viewer state | `get_follow_counts({ p_profile_id })` | Table-shaped array with a single row; client reads `data?.[0]` |
| Followers page | `get_followers({ p_profile_id, p_limit, p_offset })` | Paginated profile summary rows |
| Following page | `get_following({ p_profile_id, p_limit, p_offset })` | Paginated profile summary rows |

The `get_follow_counts` row contains `followers_count`, `following_count`, `is_following`, and `is_followed_by`. The list RPCs return `id`, `username`, `name`, `avatar_url`, `faculty`, `department`, `level`, `bio`, `followed_at`, `is_following`, and `is_followed_by`. The backend caps page size at 100; the UI currently requests 30 rows per page.

## UI/service behaviour

- Profile counts and follow state use `get_follow_counts`; counts are not inferred from the currently loaded page.
- Follow/unfollow uses only `p_following_id`. A caller ID supplied by React is never used to authorise a database mutation.
- The mutation boolean is respected: a repeated follow does not show a false “new follow” success, and repeated unfollow does not claim a relationship was removed.
- Connection lists call `get_followers` or `get_following` and get their visible totals from `get_follow_counts`. The client does not query `public.follows` or build a profile join itself.
- Missing RPC errors are surfaced as a backend-migration message rather than showing zero counts. A missing `follows` table is reported separately.
- The RPCs apply blocking restrictions and return public profile fields only. Their security boundary is the database; client-side checks are UX only.

## Notification behaviour

The backend already owns follow notifications: only a newly inserted row in `public.follows` fires `follows_notify_recipient` / `notify_on_follow_relationship()`. The source is the follow row ID. The frontend must not insert into `public.notifications`; duplicate follow RPC requests return `false` and do not produce an additional follow notification. Unfollow does not create a notification.

## Verification checklist

1. Apply the follow operations migration in PR #5 after the base relationship/notification migrations.
2. Check that authenticated direct `INSERT`/`DELETE` on `public.follows` are denied and the required RPCs are executable by authenticated users only.
3. With two test accounts, test new and repeated follow, unfollow, counts, list contents and pagination.
4. Test self-follow, deleted profiles, mutual blocking, and attempts to call the RPCs while signed out.
5. Confirm only a newly created relationship generates one follow notification and unfollow generates none.

Source-level tests cannot replace these live Supabase checks.
