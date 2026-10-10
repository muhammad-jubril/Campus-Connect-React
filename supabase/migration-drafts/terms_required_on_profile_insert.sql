-- DRAFT — NOT APPLIED. Apply only AFTER the frontend sends terms_version + privacy_version
-- on EVERY profile insert (normal signup AND the "Finish your profile" resume path).
-- Applying it earlier would make every new signup fail.
-- The BEFORE INSERT trigger stamps terms_accepted_at first, then this policy checks the row.
alter policy profiles_insert_own on public.profiles
  with check (
    (select auth.uid()) = id
    and terms_version is not null
    and privacy_version is not null
  );
