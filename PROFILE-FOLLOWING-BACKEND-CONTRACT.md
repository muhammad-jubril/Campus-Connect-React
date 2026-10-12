# Profile followers/following — backend integration contract

## Source review status

The checked-in Campus Connect React source has no follow/unfollow action and no checked-in `public.follows` table or follow-specific RPC. The notification pipeline migration only adds an optional follow-notification trigger if a real `public.follows(follower_id, following_id)` relation already exists. The frontend therefore does **not** assume the live database is ready: missing-schema errors are shown as an actionable unavailable state, counts show an em dash (not a misleading zero), and follow actions stay disabled until real summary data loads.

This patch expects the backend to implement the table contract below. No database migration or security policy is bundled here, because follow relationship storage and security belong to the backend developer.

## Relationship table expected by the frontend

```sql
public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
)
```

Useful read indexes:

```sql
create index follows_by_following_created_idx
  on public.follows (following_id, created_at desc, follower_id);
create index follows_by_follower_created_idx
  on public.follows (follower_id, created_at desc, following_id);
```

The composite primary key makes a follow unique and makes repeated insert requests safe at the database boundary. `created_at` supports stable newest-first list pages. This shape matches the optional trigger hook already present in the repository's notification pipeline migration.

## Required RLS and grants

Enable RLS on `public.follows`. At minimum, ensure:

- `SELECT` only exposes relationship rows whose two student profiles are visible to the caller. Reuse the existing `public.is_user_blocked(uuid)` restriction for both endpoints so an account blocked in either direction does not appear in another student's list or count.
- `INSERT` requires `follower_id = (select auth.uid())`, forbids self-follows, requires an existing target profile, and rejects a mutual-block pair using `public.is_user_blocked(following_id) = false`.
- `DELETE` only allows a student to remove their own outgoing edge (`follower_id = (select auth.uid())`). Backend policy should not permit one user to delete another user's follow edge.
- No client can update `follower_id`, `following_id`, or `created_at` to forge a different relationship. The database uniqueness/check constraints remain authoritative even when two tabs submit at once.
- Authenticated users receive only the column/table privileges required by those RLS policies. The service sends its signed-in user ID, but RLS must validate ownership against `auth.uid()`; never trust the client-supplied ID alone.

The existing `public.is_user_blocked(p_other_user uuid)` RPC is defined by the checked-in content-safety migration. The frontend calls it before reading another student's follow data or changing a relationship, but backend RLS remains the actual security boundary.

## Frontend query contract

The frontend uses `src/services/supabase/profileFollows.js`:

| Operation | Query contract |
|---|---|
| Profile counts | Count rows with `following_id = profile_id` for Followers and `follower_id = profile_id` for Following. These use exact count queries rather than fetching every row. |
| Current viewer state | Find a row with `follower_id = auth user id` and `following_id = profile id`. |
| Follow | Insert `{ follower_id, following_id }`; duplicate-pair error `23505` is treated as an idempotent success after the backend unique key arbitrates the race. |
| Unfollow | Delete only where both `follower_id` and `following_id` match the viewer and target. |
| List pages | Select `follower_id, following_id, created_at`, newest first, in pages of 30; load visible public metadata using the returned IDs from `profiles`. The UI follows the relationship row order and omits profiles filtered out by profile RLS. |

Profile cards expect existing `profiles` columns `id`, `username`, `name`, `avatar_url`, `faculty`, `department`, `level`, and `bio`. The existing `personFromProfileRow` mapping handles the profile page's regular profile shape.

## Blocking and notification expectations

- A viewer-to-profile block pair makes counts/list contents unavailable and prevents Follow/Unfollow in the frontend. Enforce that restriction in RLS as well; the client-side RPC check is not sufficient security by itself.
- If the app sends follow notifications, the backend should create them only after a successful new relationship insert and avoid self-notifications. Existing notification pipeline support attaches only if this exact relation and columns are present.
- Follow counts must derive from stored relationships; do not return a mock value when the table is missing.

## Verification checklist for backend handoff

1. Apply the follow table, indexes, grants, and RLS policies in the target Supabase project.
2. Sign in with two test accounts and verify following creates exactly one row, unfollowing deletes only the caller's row, and repeated requests cannot create duplicates.
3. Verify counts change after each operation and in a second browser/session.
4. Verify follower/following pagination returns the correct profiles in newest-first order.
5. Verify self-follow and following/unfollowing across either direction of a block are rejected, and blocked accounts are absent from list reads.
6. Verify unauthorized direct table writes fail even if the frontend is bypassed.
