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

## Backend migration — required before real follows work

Apply `supabase/migrations/20261012170000_profile_following_backend.sql` after the base schema, content-safety, and notification migrations. It creates or aligns `public.follows`, restricts relationship reads to unblocked pairs, restricts writes to the signed-in follower, and attaches source-keyed follow notification generation. Use `PROFILE-FOLLOWING-BACKEND-CONTRACT.md` for the expected query and RLS contract.

The profile shows an em dash and disables follow actions when follow data cannot be loaded; it never treats a missing backend table as zero relationships or successful writes.

Suggested commit message after local verification:

`feat(profile): add followers and following frontend`
