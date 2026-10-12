-- Tighten the marketplace text limits even when the original beta migration
-- was already applied to a live database. This is additive and safe to rerun.
begin;

do $$
begin
  if to_regclass('public.marketplace_listings') is null then
    raise exception 'Marketplace text-limit migration stopped: public.marketplace_listings does not exist. Apply the marketplace beta migration first.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'marketplace_listings' and column_name = 'title'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'marketplace_listings' and column_name = 'description'
  ) then
    raise exception 'Marketplace text-limit migration stopped: title or description columns are missing.';
  end if;
end
$$;

create or replace function public.enforce_marketplace_listing_text_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Validate both fields on insert, but only the modified field on update.
  -- This allows legacy rows with longer old descriptions to change status or
  -- unrelated fields without rewriting historical data, while all new/edited
  -- title and description values follow the stricter beta limits.
  if tg_op = 'INSERT' or new.title is distinct from old.title then
    if new.title is null or char_length(btrim(new.title)) < 1 or char_length(btrim(new.title)) > 30 then
      raise exception 'Product titles must contain 1 to 30 characters.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' or new.description is distinct from old.description then
    if new.description is null or char_length(btrim(new.description)) < 1 or char_length(btrim(new.description)) > 100 then
      raise exception 'Descriptions must contain 1 to 100 characters.' using errcode = '23514';
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
