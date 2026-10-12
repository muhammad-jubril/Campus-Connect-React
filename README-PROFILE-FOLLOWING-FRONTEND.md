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

## Backend dependency — required before real follows work

The checked-in source does not include a follows table or follow action. Read `PROFILE-FOLLOWING-BACKEND-CONTRACT.md` and hand it to the backend developer. This patch expects `public.follows(follower_id, following_id, created_at)`, protected by appropriate unique/check constraints, row-level security, and grants. Until it exists, the UI deliberately shows a backend-not-configured error and never pretends that a follow succeeded.

No migrations, fake data, commits, or pushes are included.

Suggested commit message after local verification:

`feat(profile): add followers and following frontend`
