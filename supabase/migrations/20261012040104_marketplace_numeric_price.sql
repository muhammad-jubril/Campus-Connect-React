-- Hardening follow-up for projects that have already recorded the original beta
-- migration. Preserve existing values while removing a zero-scale numeric typmod:
-- NUMERIC(12,0) rounds fractional input before a BEFORE trigger can reject it.
begin;
do $$
begin
  if to_regclass('public.marketplace_listings') is null then
    raise exception 'Marketplace price migration stopped: apply the marketplace beta migration first.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='marketplace_listings' and column_name='price'
      and data_type in ('numeric','integer','bigint','smallint')
  ) then
    raise exception 'Marketplace price migration stopped: price is not a supported numeric type. Inspect the live schema before retrying.';
  end if;
end
$$;
alter table public.marketplace_listings alter column price type numeric using price::numeric;
alter table public.marketplace_listings
  alter column status set default 'active',
  alter column status set not null;

-- The full rules trigger is replaced here too, so existing databases receive
-- the fixed integer-price check even if the original beta migration was applied.
create or replace function public.enforce_marketplace_listing_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare active_count integer; listing_text text;
begin
  if new.status is null or new.status not in ('active','sold','removed') then
    raise exception 'Listing status must be active, sold, or removed.' using errcode='23514';
  end if;
  new.negotiable := coalesce(new.negotiable,false);
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.seller_id is distinct from old.seller_id or new.created_at is distinct from old.created_at then
      raise exception 'A listing ID, seller, and creation time cannot be changed.' using errcode='23514';
    end if;
    if new.status is distinct from old.status and not (
      (old.status='active' and new.status in ('sold','removed')) or (old.status='sold' and new.status='removed')
    ) then raise exception 'Invalid marketplace listing status transition.' using errcode='23514'; end if;
    if old.status <> 'active' and (
      new.title is distinct from old.title or new.description is distinct from old.description or
      new.price is distinct from old.price or new.category is distinct from old.category or
      new.condition is distinct from old.condition or new.pickup_location is distinct from old.pickup_location or
      new.negotiable is distinct from old.negotiable
    ) then raise exception 'Only active listings can have product details edited.' using errcode='23514'; end if;
  elsif new.status <> 'active' then
    raise exception 'New marketplace listings must start as active.' using errcode='23514';
  end if;

  if tg_op='INSERT' or new.title is distinct from old.title then
    if new.title is null or length(btrim(new.title)) < 1 or length(btrim(new.title)) > 30 then
      raise exception 'Product titles must contain 1 to 30 characters.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.description is distinct from old.description then
    if new.description is null or length(btrim(new.description)) < 1 or length(btrim(new.description)) > 100 then
      raise exception 'Descriptions must contain 1 to 100 characters.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.price is distinct from old.price then
    if new.price is null or new.price < 1 or new.price > 10000000 or new.price <> trunc(new.price) then
      raise exception 'Price must be a whole NGN amount from 1 to 10000000.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.category is distinct from old.category then
    if new.category is null or new.category not in ('Electronics','Books & Education','Fashion','Home & Hostel','Food & Groceries','Beauty & Personal Care','Sports & Fitness','Other') then
      raise exception 'Choose a supported physical-product category.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.condition is distinct from old.condition then
    if new.condition is null or new.condition not in ('new','like_new','good','fair') then
      raise exception 'Choose a supported product condition.' using errcode='23514';
    end if;
  end if;
  if tg_op='INSERT' or new.pickup_location is distinct from old.pickup_location then
    if new.pickup_location is null or length(btrim(new.pickup_location)) < 1 or length(btrim(new.pickup_location)) > 120 then
      raise exception 'Pickup location must contain 1 to 120 characters.' using errcode='23514';
    end if;
  end if;

  if tg_op='INSERT' or new.title is distinct from old.title or new.description is distinct from old.description then
    listing_text := coalesce(new.title,'') || ' ' || coalesce(new.description,'');
    if listing_text ~* '\m(firearms?|guns?|pistols?|rifles?|ammunition|explosives?|bombs?|cocaine|heroin|methamphetamine|meth|fentanyl|illicit[[:space:]]+drugs?|marijuana|cannabis|weed|alcohol|beer|wine|liquor|tobacco|cigarettes?|vapes?|nicotine|prescription([- ]only[[:space:]]+|[[:space:]]+)(medicines?|medications?|drugs?)|counterfeit|stolen[[:space:]]+(goods?|phones?|laptops?|bikes?|bicycles?|items?|property|devices?)|fake[[:space:]]+branded|replica[[:space:]]+brand|sex[[:space:]]+toys?|adult[[:space:]]+(toys?|products?)|pornography)\M' then
      raise exception 'This listing may include a prohibited item. Weapons, controlled drugs, alcohol, tobacco/vapes, prescription-only medicines, counterfeit or stolen goods, and adult products are not allowed.' using errcode='23514';
    end if;
    if listing_text ~* '\m(tutoring|photography|graphic[[:space:]]+design|repairs?|plumbing|cleaning)[[:space:]]+(services?|available|offered|provided|sessions?|appointments?|for[[:space:]]+hire)\M'
      or listing_text ~* '\m(i|we)[[:space:]]+(offer|provide|do)[[:space:]]+(tutoring|photography|graphic[[:space:]]+design|repairs?|plumbing|cleaning)\M'
      or listing_text ~* '\mservices?[[:space:]]+only\M'
      or listing_text ~* '\mbook[[:space:]]+(a[[:space:]]+)?(session|appointment)\M' then
      raise exception 'Marketplace listings are for physical products only. Service offers are not allowed.' using errcode='23514';
    end if;
  end if;

  if tg_op='INSERT' or new.images is distinct from old.images or new.image_path is distinct from old.image_path then
    if coalesce(cardinality(new.images),0) > 1 then
      raise exception 'A marketplace listing can contain only one image.' using errcode='23514';
    elsif coalesce(cardinality(new.images),0) = 0 then
      if new.image_path is not null then raise exception 'An image storage path cannot be set without an image URL.' using errcode='23514'; end if;
    elsif new.images[1] is null or new.image_path is null
      or new.image_path not like new.seller_id::text || '/%'
      or not public.urls_in_own_folder(new.images, 'marketplace-images', new.seller_id)
      or split_part(new.images[1], '/storage/v1/object/public/marketplace-images/', 2) is distinct from new.image_path then
      raise exception 'Product images must use the seller-owned marketplace-images path and match the image URL.' using errcode='23514';
    end if;
  end if;

  if new.status='active' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.seller_id::text,0));
    select count(*) into active_count from public.marketplace_listings l
    where l.seller_id=new.seller_id and l.status='active' and (tg_op='INSERT' or l.id is distinct from new.id);
    if active_count >= 3 then raise exception 'You can have a maximum of three active listings. Mark one sold or remove one before creating another.' using errcode='23514'; end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.enforce_marketplace_listing_rules() from public, anon, authenticated;
drop trigger if exists marketplace_listings_enforce_rules on public.marketplace_listings;
create trigger marketplace_listings_enforce_rules before insert or update on public.marketplace_listings
for each row execute function public.enforce_marketplace_listing_rules();

-- Rebuild marketplace RLS/grants to remove legacy permissive policies and keep
-- unexpected private columns out of PostgREST responses on an older schema.
do $$
declare p record; c record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='marketplace_listings' loop
    execute format('drop policy if exists %I on public.marketplace_listings',p.policyname);
  end loop;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='marketplace_listings' loop
    execute format('revoke all (%I) on table public.marketplace_listings from public, anon, authenticated',c.column_name);
  end loop;
end
$$;
alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from public, anon, authenticated;
grant select (id,seller_id,title,description,price,category,condition,images,image_path,status,pickup_location,negotiable,created_at,updated_at) on public.marketplace_listings to authenticated;
grant insert (seller_id,title,description,price,category,condition,images,image_path,pickup_location,negotiable) on public.marketplace_listings to authenticated;
grant update (title,description,price,category,condition,images,image_path,status,pickup_location,negotiable) on public.marketplace_listings to authenticated;
create policy marketplace_listings_select_visible on public.marketplace_listings for select to authenticated
  using (status='active' or seller_id=(select auth.uid()));
create policy marketplace_listings_insert_own on public.marketplace_listings for insert to authenticated
  with check (seller_id=(select auth.uid()));
create policy marketplace_listings_update_own on public.marketplace_listings for update to authenticated
  using (seller_id=(select auth.uid())) with check (seller_id=(select auth.uid()));

-- Replace any prior broad report policies and keep report content private to reporters.
do $$
declare p record; c record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='marketplace_reports' loop
    execute format('drop policy if exists %I on public.marketplace_reports',p.policyname);
  end loop;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='marketplace_reports' loop
    execute format('revoke all (%I) on table public.marketplace_reports from public, anon, authenticated',c.column_name);
  end loop;
end
$$;
alter table public.marketplace_reports enable row level security;
revoke all on public.marketplace_reports from public, anon, authenticated;
grant select (id,listing_id,reporter_id,reason,details,created_at) on public.marketplace_reports to authenticated;
grant insert (listing_id,reporter_id,reason,details) on public.marketplace_reports to authenticated;
create policy marketplace_reports_select_own on public.marketplace_reports for select to authenticated using (reporter_id=(select auth.uid()));
create policy marketplace_reports_insert_own on public.marketplace_reports for insert to authenticated
  with check (reporter_id=(select auth.uid()) and exists (select 1 from public.marketplace_listings l where l.id=listing_id and l.status='active' and l.seller_id <> (select auth.uid())));

-- Public read is intentional for product images. Mutations remain limited to the owner's folder.
-- A public bucket exposes every object in it. If a pre-existing bucket is
-- private and already contains objects, stop rather than exposing those files
-- implicitly; inspect/reconcile them through the preflight script first.
do $$
begin
  if exists (select 1 from storage.buckets where id='marketplace-images' and public=false)
     and exists (select 1 from storage.objects where bucket_id='marketplace-images') then
    raise exception 'Marketplace Storage setup stopped: marketplace-images already contains objects in a private bucket. Inspect those objects before changing the bucket to public.';
  end if;
end
$$;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('marketplace-images','marketplace-images',true,409600,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=409600,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
    and (coalesce(qual,'') ilike '%marketplace-images%' or coalesce(with_check,'') ilike '%marketplace-images%') loop
    execute format('drop policy if exists %I on storage.objects',p.policyname);
  end loop;
end
$$;
create policy marketplace_images_public_read on storage.objects for select to anon,authenticated using (bucket_id='marketplace-images');
create policy marketplace_images_insert_own_folder on storage.objects for insert to authenticated
  with check (bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy marketplace_images_delete_own_folder on storage.objects for delete to authenticated
  using (bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

commit;
