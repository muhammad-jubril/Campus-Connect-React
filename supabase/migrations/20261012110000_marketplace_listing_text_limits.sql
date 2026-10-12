-- Follow-up limit for live projects that already recorded the beta migration.
begin;

do $$
begin
  if to_regclass('public.marketplace_listings') is null then
    raise exception 'Marketplace text-limit migration stopped: apply the marketplace beta migration first.';
  end if;
end
$$;

create or replace function public.enforce_marketplace_listing_text_limits()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' or new.title is distinct from old.title then
    if new.title is null or char_length(btrim(new.title)) < 1 or char_length(btrim(new.title)) > 30 then
      raise exception 'Product titles must contain 1 to 30 characters.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.description is distinct from old.description then
    if new.description is null or char_length(btrim(new.description)) < 1 or char_length(btrim(new.description)) > 100 then
      raise exception 'Descriptions must contain 1 to 100 characters.' using errcode='23514';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.enforce_marketplace_listing_text_limits() from public, anon, authenticated;
drop trigger if exists marketplace_listings_enforce_text_limits on public.marketplace_listings;
create trigger marketplace_listings_enforce_text_limits
before insert or update of title, description on public.marketplace_listings
for each row execute function public.enforce_marketplace_listing_text_limits();
commit;
