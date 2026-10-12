-- Legal wording versions are a publication date with an optional revision suffix: 2026-10-11 or 2026-10-11-v2.
-- (The first version of this check accepted only YYYY-MM-DD and rejected the frontend's "2026-10-11-v2".)
alter table public.profiles drop constraint if exists profiles_legal_version_format;
alter table public.profiles add constraint profiles_legal_version_format check (
  (terms_version is null or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]{1,3})?$')
  and (privacy_version is null or privacy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]{1,3})?$')
);