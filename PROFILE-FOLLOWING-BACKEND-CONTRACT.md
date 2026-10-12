# Profile followers/following — backend integration contract

## Source review status

The frontend reads and writes follow relationships through `public.follows`; migration `supabase/migrations/20261012170000_profile_following_backend.sql` now provides the matching table contract, ownership grants, block-aware RLS, indexes, and server-generated follow notifications. The UI deliberately shows an em dash (not a misleading zero) when the relationship data cannot be loaded, and disables follow actions until the signed-in viewer's relationship state is known.

The migration is forward-only and idempotent for the expected `public.follows` contract. It attaches the follow notification trigger explicitly because the older notification pipeline only attached that trigger when a follows table already existed at the time that earlier migration ran.

## Relationship table expected by the frontend

```sql
public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
)
```

Useful read indexes:

```sql
create index follows_following_created_idx
  on public.follows (following_id, created_at desc, id desc, follower_id);
create index follows_follower_created_idx
  on public.follows (follower_id, created_at desc, id desc, following_id);
```

The unique follower/following pair makes a follow unique and makes repeated insert requests safe at the database boundary. The `id` value is used by the current follow-status query and as the notification source identity. `created_at` supports stable newest-first list pages.

## Required RLS and grants

The checked-in migration enables RLS on `public.follows`, grants authenticated users SELECT plus INSERT on only `following_id` and DELETE, and removes older policies before installing the scoped policies. The SELECT policy permits complete follower/following lists for unblocked student pairs, while hiding edges where either endpoint is blocked by the viewer. INSERT derives `follower_id` from `auth.uid()`, rejects self-follows and blocked targets, and a unique constraint/index prevents duplicate edges. DELETE permits only the signed-in follower to remove their own outgoing edge.

For production, confirm these policies and grants after applying the migration. The relationship table should:

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
| Follow | Insert `{ following_id }`; PostgreSQL derives `follower_id` from `auth.uid()`. Duplicate-pair error `23505` is treated as an idempotent success after the backend unique key arbitrates the race. |
| Unfollow | Delete only where both `follower_id` and `following_id` match the viewer and target. |
| List pages | Select relationship rows newest first, tie-breaking by `id` descending, in pages of 30; load visible public metadata using the returned IDs from `profiles`. The stable tie-break avoids skipped/repeated rows when multiple follows have the same transaction timestamp. |

Profile cards expect existing `profiles` columns `id`, `username`, `name`, `avatar_url`, `faculty`, `department`, `level`, and `bio`. The existing `personFromProfileRow` mapping handles the profile page's regular profile shape.

## Blocking and notification expectations

- A viewer-to-profile block pair makes counts/list contents unavailable and prevents Follow/Unfollow in the frontend. Enforce that restriction in RLS as well; the client-side RPC check is not sufficient security by itself.
- The migration generates follow notifications after successful relationship inserts, suppresses bilateral-block/self events, keys each notification to the follow row through `source_id`, and attaches the trigger even when the prior notification migration ran before the follows table existed.
- Follow counts must derive from stored relationships; do not return a mock value when the table is missing.

## Verification checklist for deployment

1. Apply `supabase/migrations/20261012170000_profile_following_backend.sql` after the base schema, content-safety and notifications migrations in the target Supabase project.
2. Sign in with two test accounts and verify following creates exactly one row, unfollowing deletes only the caller's row, and repeated requests cannot create duplicates.
3. Verify counts change after each operation and in a second browser/session.
4. Verify follower/following pagination returns the correct profiles in newest-first order.
5. Verify self-follow and following/unfollowing across either direction of a block are rejected, and blocked accounts are absent from list reads.
6. Verify unauthorized direct table writes fail even if the frontend is bypassed.
