-- Adds the bio column the Edit Profile screen already has UI for.
-- App change needed: personFromProfileRow must read row.bio, updateProfile must send it.
begin;

alter table public.profiles add column if not exists bio text;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 160);

alter table public.profiles drop constraint if exists profiles_name_length;
alter table public.profiles add constraint profiles_name_length
  check (char_length(btrim(name)) between 1 and 60);

commit;
