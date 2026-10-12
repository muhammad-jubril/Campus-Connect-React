-- Index substring search as well as the structured filters. The ordinary
-- partial b-tree indexes in the beta migration cover category, condition,
-- price, newest-first browse, and seller status. ILIKE '%term%' needs trigrams.
begin;

-- Newly-uploaded product image paths are unique per listing. This prevents a
-- seller from making two listings point to one object and breaking one listing
-- when the other listing's cleanup deletes that object. Stop if old data has
-- duplicates; do not pick/delete a listing or stored file automatically.
do $$
declare duplicate_path text;
begin
  select image_path into duplicate_path
  from public.marketplace_listings
  where image_path is not null
  group by image_path
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'Marketplace index migration stopped: more than one listing references image path %. Reconcile these references manually before retrying.', duplicate_path;
  end if;
end
$$;
create unique index if not exists marketplace_listings_image_path_unique_idx
  on public.marketplace_listings (image_path)
  where image_path is not null;

do $$
declare
  trgm_schema text;
  extension_schema text;
begin
  select n.nspname into trgm_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if trgm_schema is null then
    if not exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
      raise notice 'pg_trgm is unavailable; Marketplace substring search will use the existing b-tree indexes and may scan active rows.';
      return;
    end if;

    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      extension_schema := 'extensions';
    else
      extension_schema := 'public';
    end if;
    execute format('create extension if not exists pg_trgm with schema %I', extension_schema);
    select n.nspname into trgm_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm';
  end if;

  execute format(
    'create index if not exists marketplace_listings_active_title_trgm_idx on public.marketplace_listings using gin (title %I.gin_trgm_ops) where status = ''active''',
    trgm_schema
  );
  execute format(
    'create index if not exists marketplace_listings_active_location_trgm_idx on public.marketplace_listings using gin (pickup_location %I.gin_trgm_ops) where status = ''active''',
    trgm_schema
  );
end
$$;

commit;
