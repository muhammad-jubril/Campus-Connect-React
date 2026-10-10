-- Records affirmative acceptance of the Terms and Privacy Policy. No defaults: existing profiles stay NULL.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_version text;

alter table public.profiles drop constraint if exists profiles_consent_consistent;
alter table public.profiles add constraint profiles_consent_consistent check (
  (terms_version is null) = (privacy_version is null)
  and (terms_version is null) = (terms_accepted_at is null)
);

alter table public.profiles drop constraint if exists profiles_legal_version_format;
alter table public.profiles add constraint profiles_legal_version_format check (
  (terms_version is null or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  and (privacy_version is null or privacy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

-- The client states WHICH wording it accepted (the two version fields); the server stamps WHEN.
-- A client-supplied terms_accepted_at is ignored, so consent time cannot be backdated or forged.
create or replace function public.stamp_profile_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.terms_version is not null or new.privacy_version is not null then
    if new.terms_version is null or new.privacy_version is null then
      raise exception 'terms_version and privacy_version must be provided together' using errcode = '23514';
    end if;
    new.terms_accepted_at := clock_timestamp();
  else
    new.terms_accepted_at := null;
  end if;
  return new;
end
$$;

revoke all on function public.stamp_profile_consent() from public, anon, authenticated;

drop trigger if exists profiles_stamp_consent on public.profiles;
create trigger profiles_stamp_consent
  before insert on public.profiles
  for each row execute function public.stamp_profile_consent();
