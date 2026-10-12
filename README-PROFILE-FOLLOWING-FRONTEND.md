# Campus Connect — profile followers/following frontend patch

## What changed

- Keeps the existing Campus Identity profile card, profile editing, blocked accounts entry, campus and level stats, and post feed.
- Adds a Follow/Following action on other students' profiles only, including a busy guard, disabled/loading states, inline errors, and confirmed-count reconciliation after success.
- Replaces the old three-stat grid with Posts, Followers, Following, Campus, and Level. Followers/Following open real list routes. Counts are fetched from Supabase and appear as `—` until actual values can be loaded; a missing backend table is not treated as zero.
- Adds responsive `/profile/:username/followers` and `/profile/:username/following` pages with profile photos, names, usernames, loading/empty/error states, retry, pagination, and navigation to each account's profile.
- Uses the existing Supabase client/auth/profile mapping, existing `Avatar`, existing routes and `ScreenLayout`, plus the existing `is_user_blocked` RPC. No frontend-only relationship storage was introduced.

## Install locally

1. Extract this ZIP directly into the root of the existing Campus Connect React project and allow file replacement.
2. Restart Vite (`Ctrl+C`, then `npm run dev`) and check the profile pages.
3. Run `npm test`, `npm run lint`, and `npm run build` in your full project.

## Backend integration — required before real follows work

Use the backend RPC contract in PR #5, including `supabase/migrations/20261012170749_follow_operations_and_profile_queries.sql`. The frontend calls `follow_student`, `unfollow_student`, `get_follow_counts`, `get_followers`, and `get_following`; it must not write directly to `public.follows`. Apply the PR's relationship/notification migrations in order and use `PROFILE-FOLLOWING-BACKEND-CONTRACT.md` for the exact RPC arguments and result shape.

The profile shows an em dash and disables follow actions when follow data cannot be loaded; it never treats a missing table or RPC as zero relationships or successful writes. Database RPCs derive the acting user from `auth.uid()` and return booleans so repeated requests are reflected accurately in the UI.

Suggested commit message after local verification:

`feat(profile): add followers and following frontend`
