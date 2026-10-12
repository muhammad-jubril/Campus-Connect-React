-- Campus Connect Marketplace beta.
-- Before applying, run supabase/diagnostics/marketplace-preflight.sql against the live project.
-- Existing listing rows and stored objects are preserved; incompatible legacy data stops the migration.
begin;

do $$
begin
  if to_regclass('public.marketplace_listings') is null then
    create table public.marketplace_listings (
      id uuid primary key default gen_random_uuid(),
      seller_id uuid not null references public.profiles(id) on delete restrict,
      title text not null,
      description text not null,
      price numeric not null,
      category text not null,
      condition text not null,
      images text[] null,
      image_path text null,
      status text not null default 'active',
      pickup_location text not null,
      negotiable boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='id')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='seller_id')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='title')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='description')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='price')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='category')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='images')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='created_at') then
      raise exception 'Marketplace migration stopped: marketplace_listings does not match the expected core schema. Run the marketplace preflight query and reconcile the schema without discarding existing rows.';
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='marketplace_listings' and column_name='images'
        and data_type='ARRAY' and udt_name='_text'
    ) then
      raise exception 'Marketplace migration stopped: marketplace_listings.images is not text[]. Inspect the live schema before continuing.';
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='marketplace_listings' and column_name='price'
        and data_type in ('numeric','integer','bigint','smallint')
    ) then
      raise exception 'Marketplace migration stopped: price must already be a numeric/integer type. Inspect and migrate legacy price text explicitly rather than casting it automatically.';
    end if;
  end if;
end
$$;

alter table public.marketplace_listings
  -- Existing deployments can have the earlier schema without these beta fields.
  -- Leave fields nullable for legacy rows; inserts/changes are validated below.
  add column if not exists condition text,
  add column if not exists image_path text,
  add column if not exists status text not null default 'active',
  add column if not exists pickup_location text,
  add column if not exists negotiable boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- The legacy table declared images NOT NULL, while the current UI clears a
-- removed listing's image by writing NULL. This preserves existing arrays and
-- matches the current frontend contract.
alter table public.marketplace_listings alter column images drop not null;

-- A scale-free numeric column preserves fractional API input so the trigger can
-- reject it. NUMERIC(12,0) silently rounds input before a BEFORE trigger sees it.
alter table public.marketplace_listings
  alter column price type numeric using price::numeric;

do $$
declare
  status_type text;
  invalid_status text;
  type_problem text;
  over_limit_seller uuid;
  over_limit_count bigint;
begin
  select data_type into status_type from information_schema.columns
  where table_schema='public' and table_name='marketplace_listings' and column_name='status';
  if status_type not in ('text', 'character varying') then
    raise exception 'Marketplace migration stopped: status must be text/varchar, found %. Inspect the live schema before retrying.', status_type;
  end if;

  select coalesce(status, '<NULL>') into invalid_status
  from public.marketplace_listings
  where status is null or status not in ('active', 'sold', 'removed') limit 1;
  if found then
    raise exception 'Marketplace migration stopped: existing status (%) is not active, sold, or removed. Map legacy statuses explicitly before retrying.', invalid_status;
  end if;

  select string_agg(column_name || '=' || data_type, ', ')
  into type_problem
  from information_schema.columns
  where table_schema='public' and table_name='marketplace_listings'
    and ((column_name in ('id','seller_id') and data_type <> 'uuid')
      or (column_name in ('title','description','category','condition','status','image_path','pickup_location') and data_type not in ('text','character varying'))
      or (column_name='price' and data_type <> 'numeric')
      or (column_name in ('created_at','updated_at') and data_type <> 'timestamp with time zone')
      or (column_name='negotiable' and data_type <> 'boolean'));
  if type_problem is not null then
    raise exception 'Marketplace migration stopped: unexpected column types (%). Reconcile the live schema explicitly rather than casting/discarding data.', type_problem;
  end if;

  select seller_id, count(*) into over_limit_seller, over_limit_count
  from public.marketplace_listings where status='active'
  group by seller_id having count(*) > 3 limit 1;
  if found then
    raise exception 'Marketplace migration stopped: seller % already has % active listings. Ask that seller to mark items sold/remove them, then retry.', over_limit_seller, over_limit_count;
  end if;
end
$$;

-- Replace legacy status checks (the live schema allows only active/sold) so
-- the frontend's supported soft-removal state is enforced by the database too.
do $$
declare
  status_attnum smallint;
  c record;
begin
  select attnum into status_attnum
  from pg_attribute
  where attrelid='public.marketplace_listings'::regclass
    and attname='status' and not attisdropped;

  for c in
    select conname from pg_constraint
    where conrelid='public.marketplace_listings'::regclass
      and contype='c' and status_attnum = any(conkey)
  loop
    execute format('alter table public.marketplace_listings drop constraint %I', c.conname);
  end loop;
end
$$;
alter table public.marketplace_listings
  add constraint marketplace_listings_status_check
  check (status in ('active','sold','removed')) not valid;
alter table public.marketplace_listings validate constraint marketplace_listings_status_check;

-- Ensure existing-but-nullable status columns also receive the beta default.
-- The preceding preflight rejects null/unknown legacy values before tightening.
alter table public.marketplace_listings
  alter column status set default 'active',
  alter column status set not null;

-- Tie listings to Campus Connect profiles rather than auth.users directly.
-- The earlier auth.users ON DELETE CASCADE would silently delete listings;
-- profile-level RESTRICT gives the intended account-deletion behavior. Stop if
-- legacy rows are orphaned instead of dropping/rewriting them.
do $$
declare
  seller_attnum smallint;
  orphan_seller uuid;
  c record;
begin
  select attnum into seller_attnum
  from pg_attribute
  where attrelid='public.marketplace_listings'::regclass
    and attname='seller_id' and not attisdropped;

  select l.seller_id into orphan_seller
  from public.marketplace_listings l
  left join public.profiles p on p.id=l.seller_id
  where p.id is null
  limit 1;
  if found then
    raise exception 'Marketplace migration stopped: seller % has no Campus Connect profile. Reconcile that listing explicitly before retrying.', orphan_seller;
  end if;

  for c in
    select conname from pg_constraint
    where conrelid='public.marketplace_listings'::regclass
      and contype='f' and confrelid='auth.users'::regclass
      and seller_attnum = any(conkey)
  loop
    execute format('alter table public.marketplace_listings drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.marketplace_listings'::regclass and c.contype='f'
      and c.confrelid='public.profiles'::regclass
      and seller_attnum = any(c.conkey)
  ) then
    alter table public.marketplace_listings
      add constraint marketplace_listings_seller_profile_fkey
      foreign key (seller_id) references public.profiles(id) on delete restrict not valid;
  end if;

  for c in
    select conname from pg_constraint
    where conrelid='public.marketplace_listings'::regclass
      and contype='f' and confrelid='public.profiles'::regclass
      and seller_attnum = any(conkey) and not convalidated
  loop
    execute format('alter table public.marketplace_listings validate constraint %I', c.conname);
  end loop;
end
$$;

-- Keep older marketplace items readable, including objects in the historic
-- post-media bucket. New/changed images must use marketplace-images.
alter table public.marketplace_listings drop constraint if exists listings_images_own_folder;
alter table public.marketplace_listings drop constraint if exists marketplace_listings_images_owned_url;
alter table public.marketplace_listings
  add constraint marketplace_listings_images_owned_url
  check (
    images is null
    or public.urls_in_own_folder(images, 'marketplace-images', seller_id)
    or public.urls_in_own_folder(images, 'post-media', seller_id)
  ) not valid;

create index if not exists marketplace_listings_active_newest_idx
  on public.marketplace_listings (created_at desc, id desc) where status='active';
create index if not exists marketplace_listings_active_category_idx
  on public.marketplace_listings (category, created_at desc) where status='active';
create index if not exists marketplace_listings_active_condition_idx
  on public.marketplace_listings (condition, created_at desc) where status='active';
create index if not exists marketplace_listings_active_price_idx
  on public.marketplace_listings (price, created_at desc) where status='active';
create index if not exists marketplace_listings_seller_status_newest_idx
  on public.marketplace_listings (seller_id, status, created_at desc);

create or replace function public.enforce_marketplace_listing_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
  listing_text text;
begin
  if new.status is null or new.status not in ('active', 'sold', 'removed') then
    raise exception 'Listing status must be active, sold, or removed.' using errcode='23514';
  end if;
  new.negotiable := coalesce(new.negotiable, false);

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.seller_id is distinct from old.seller_id
       or new.created_at is distinct from old.created_at then
      raise exception 'A listing ID, seller, and creation time cannot be changed.' using errcode='23514';
    end if;
    if new.status is distinct from old.status and not (
      (old.status='active' and new.status in ('sold','removed'))
      or (old.status='sold' and new.status='removed')
    ) then
      raise exception 'Invalid marketplace listing status transition.' using errcode='23514';
    end if;
    if old.status <> 'active' and (
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.price is distinct from old.price
      or new.category is distinct from old.category
      or new.condition is distinct from old.condition
      or new.pickup_location is distinct from old.pickup_location
      or new.negotiable is distinct from old.negotiable
    ) then
      raise exception 'Only active listings can have product details edited.' using errcode='23514';
    end if;
  elsif new.status <> 'active' then
    raise exception 'New marketplace listings must start as active.' using errcode='23514';
  end if;

  -- For legacy rows, validate fields when inserted or changed. This lets sellers
  -- mark older listings sold even if an old row predates newer beta fields.
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

  -- Optional single image. On updates, older post-media URLs remain unchanged;
  -- every new/changed image must belong to the seller's marketplace bucket path.
  if tg_op='INSERT' or new.images is distinct from old.images or new.image_path is distinct from old.image_path then
    if coalesce(cardinality(new.images),0) > 1 then
      raise exception 'A marketplace listing can contain only one image.' using errcode='23514';
    elsif coalesce(cardinality(new.images),0) = 0 then
      if new.image_path is not null then
        raise exception 'An image storage path cannot be set without an image URL.' using errcode='23514';
      end if;
    elsif new.images[1] is null
      or new.image_path is null
      or new.image_path not like new.seller_id::text || '/%'
      or not public.urls_in_own_folder(new.images, 'marketplace-images', new.seller_id)
      or split_part(new.images[1], '/storage/v1/object/public/marketplace-images/', 2) is distinct from new.image_path then
      raise exception 'Product images must use the seller-owned marketplace-images path and match the image URL.' using errcode='23514';
    end if;
  end if;

  -- Per-seller transaction advisory lock serializes concurrent creates/updates;
  -- checking only in React would be bypassable through direct API calls.
  if new.status='active' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.seller_id::text, 0));
    select count(*) into active_count from public.marketplace_listings l
    where l.seller_id=new.seller_id and l.status='active'
      and (tg_op='INSERT' or l.id is distinct from new.id);
    if active_count >= 3 then
      raise exception 'You can have a maximum of three active listings. Mark one sold or remove one before creating another.' using errcode='23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists marketplace_listings_enforce_rules on public.marketplace_listings;
create trigger marketplace_listings_enforce_rules
before insert or update on public.marketplace_listings
for each row execute function public.enforce_marketplace_listing_rules();
revoke all on function public.enforce_marketplace_listing_rules() from public, anon, authenticated;

-- Reset marketplace policies so an older permissive policy cannot expose sold/removed rows.
do $$
declare p record; c record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='marketplace_listings' loop
    execute format('drop policy if exists %I on public.marketplace_listings', p.policyname);
  end loop;
  -- Table-level REVOKE does not erase legacy column-specific grants.
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='marketplace_listings' loop
    execute format('revoke all (%I) on table public.marketplace_listings from public, anon, authenticated', c.column_name);
  end loop;
end
$$;
alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from public, anon, authenticated;
-- Column grants deliberately exclude any extra legacy/private columns that may exist.
grant select (id, seller_id, title, description, price, category, condition, images, image_path, status, pickup_location, negotiable, created_at, updated_at)
  on public.marketplace_listings to authenticated;
grant insert (seller_id, title, description, price, category, condition, images, image_path, pickup_location, negotiable)
  on public.marketplace_listings to authenticated;
grant update (title, description, price, category, condition, images, image_path, status, pickup_location, negotiable)
  on public.marketplace_listings to authenticated;
create policy marketplace_listings_select_visible on public.marketplace_listings
  for select to authenticated using (status='active' or seller_id=(select auth.uid()));
create policy marketplace_listings_insert_own on public.marketplace_listings
  for insert to authenticated with check (seller_id=(select auth.uid()));
create policy marketplace_listings_update_own on public.marketplace_listings
  for update to authenticated using (seller_id=(select auth.uid())) with check (seller_id=(select auth.uid()));

-- One private report per reporter/listing pair, with a rolling per-account cap.
create table if not exists public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (reason in ('prohibited_item','scam_or_suspicious','misleading_listing','harassment','other')),
  details text null check (details is null or char_length(details) <= 800),
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);
create index if not exists marketplace_reports_listing_created_idx on public.marketplace_reports (listing_id, created_at desc);
create index if not exists marketplace_reports_reporter_created_idx on public.marketplace_reports (reporter_id, created_at desc);

create or replace function public.validate_marketplace_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; listing_status text; recent_report_count integer;
begin
  if new.reporter_id is distinct from (select auth.uid()) then
    raise exception 'A report must belong to the signed-in reporter.' using errcode='23514';
  end if;
  select seller_id, status into owner_id, listing_status from public.marketplace_listings where id=new.listing_id;
  if owner_id is null or listing_status <> 'active' then
    raise exception 'Only active listings can be reported.' using errcode='23514';
  end if;
  if owner_id=new.reporter_id then raise exception 'You cannot report your own listing.' using errcode='23514'; end if;
  if new.details is not null and char_length(new.details) > 800 then raise exception 'Report details must be 800 characters or fewer.' using errcode='23514'; end if;
  if new.reason is null or new.reason not in ('prohibited_item','scam_or_suspicious','misleading_listing','harassment','other') then
    raise exception 'Choose a supported report reason.' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.reporter_id::text, 1));
  select count(*) into recent_report_count from public.marketplace_reports
  where reporter_id=new.reporter_id and created_at >= now() - interval '1 hour';
  if recent_report_count >= 10 then raise exception 'You have reached the marketplace report limit. Try again later.' using errcode='23514'; end if;
  return new;
end
$$;
drop trigger if exists marketplace_reports_validate on public.marketplace_reports;
create trigger marketplace_reports_validate before insert on public.marketplace_reports
for each row execute function public.validate_marketplace_report();
revoke all on function public.validate_marketplace_report() from public, anon, authenticated;
do $$
declare p record; c record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='marketplace_reports' loop
    execute format('drop policy if exists %I on public.marketplace_reports', p.policyname);
  end loop;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='marketplace_reports' loop
    execute format('revoke all (%I) on table public.marketplace_reports from public, anon, authenticated', c.column_name);
  end loop;
end
$$;
alter table public.marketplace_reports enable row level security;
revoke all on public.marketplace_reports from public, anon, authenticated;
grant select (id, listing_id, reporter_id, reason, details, created_at) on public.marketplace_reports to authenticated;
grant insert (listing_id, reporter_id, reason, details) on public.marketplace_reports to authenticated;
create policy marketplace_reports_select_own on public.marketplace_reports for select to authenticated
  using (reporter_id=(select auth.uid()));
create policy marketplace_reports_insert_own on public.marketplace_reports for insert to authenticated
  with check (reporter_id=(select auth.uid()) and exists (
    select 1 from public.marketplace_listings l where l.id=listing_id and l.status='active' and l.seller_id <> (select auth.uid())
  ));

-- Public-read bucket by design: active listing photos are public product imagery.
-- Upload and delete paths are constrained to the authenticated seller's folder.
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
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-images','marketplace-images',true,409600,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=409600, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
-- Remove previous policies scoped to this bucket before replacing them. Storage
-- policies are permissive by default; leaving an older broad insert policy in
-- place would OR it with the owner-folder policy below.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
    and (coalesce(qual,'') ilike '%marketplace-images%' or coalesce(with_check,'') ilike '%marketplace-images%') loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end
$$;
create policy marketplace_images_public_read on storage.objects for select to anon, authenticated
  using (bucket_id='marketplace-images');
create policy marketplace_images_insert_own_folder on storage.objects for insert to authenticated
  with check (bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy marketplace_images_delete_own_folder on storage.objects for delete to authenticated
  using (bucket_id='marketplace-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

commit;
