-- Read-only preflight for Campus Connect Marketplace beta.
-- Run this against the intended Supabase project BEFORE applying the
-- Marketplace migrations. It returns schema/policy metadata, not user row data.

-- 1. Table/column definitions (does marketplace_listings exist, and is its
-- image column text[] as expected?).
select c.ordinal_position, c.column_name, c.data_type, c.udt_name,
       c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('marketplace_listings', 'marketplace_reports')
order by c.table_name, c.ordinal_position;

-- 2. Constraints and foreign-key targets.
select con.conrelid::regclass as table_name, con.conname as constraint_name,
       con.contype as constraint_type, pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
where con.conrelid in (
  to_regclass('public.marketplace_listings')::oid,
  to_regclass('public.marketplace_reports')::oid
)
order by con.conrelid::regclass::text, con.contype, con.conname;

-- 3. RLS state and current policies.
select c.oid::regclass as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
where c.oid in (
  to_regclass('public.marketplace_listings')::oid,
  to_regclass('public.marketplace_reports')::oid
);

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('marketplace_listings', 'marketplace_reports')
order by tablename, policyname;

-- 4. Table-level AND column-level grants. Unexpected legacy columns should not
-- be readable/writable by anon/authenticated roles.
select table_name, grantee, privilege_type, column_name
from (
  select table_name, grantee, privilege_type, null::text as column_name
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('marketplace_listings', 'marketplace_reports')
  union all
  select table_name, grantee, privilege_type, column_name
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name in ('marketplace_listings', 'marketplace_reports')
) grants
order by table_name, grantee, privilege_type, column_name nulls first;

-- 5. Bucket limits and related Storage policies.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars', 'post-media', 'marketplace-images')
order by id;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') ilike '%marketplace-images%'
    or coalesce(with_check, '') ilike '%marketplace-images%')
order by policyname;

-- 6. Seller accounts currently over the proposed three-active-listing cap.
-- The migration refuses to apply if this query finds any rows; do not delete
-- or auto-mark legacy listings just to force the migration through.
do $$
declare status_exists boolean; seller_exists boolean; over_limit bigint;
begin
  if to_regclass('public.marketplace_listings') is null then
    raise notice 'marketplace_listings does not exist; the beta migration will create it.';
    return;
  end if;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='status'),
         exists (select 1 from information_schema.columns where table_schema='public' and table_name='marketplace_listings' and column_name='seller_id')
  into status_exists, seller_exists;
  if status_exists and seller_exists then
    execute 'select count(*) from (select seller_id from public.marketplace_listings where status = ''active'' group by seller_id having count(*) > 3) over_limit_accounts'
      into over_limit;
    raise notice 'Seller accounts with more than three active listings: %', over_limit;
  else
    raise notice 'Legacy listing table does not yet have status/seller_id; inspect and reconcile schema before migration.';
  end if;
end
$$;

-- 7. The shared urls_in_own_folder() function in the existing security
-- hardening migration embeds this project's public Storage URL. Compare the
-- returned function body with the target project's URL in its Supabase
-- dashboard; this is a URL check only and does not reveal a secret key.
select p.oid::regprocedure as function_name, pg_get_functiondef(p.oid) as function_definition
from pg_proc p
where p.oid = to_regprocedure('public.urls_in_own_folder(text[],text,uuid)');

-- 8. If a marketplace-images bucket exists already, check whether a private
-- bucket contains objects before any migration changes it to public.
select b.id, b.public, count(o.id) as stored_object_count
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
where b.id = 'marketplace-images'
group by b.id, b.public;

-- 9. Duplicate non-null image paths prevent the cleanup-safe unique index from
-- being installed. Review results and reconcile references manually if any are returned.
select image_path, count(*) as listing_count
from public.marketplace_listings
where image_path is not null
group by image_path
having count(*) > 1;
