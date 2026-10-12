-- Run this read-only script in the Supabase SQL Editor BEFORE applying the
-- marketplace beta migration. It reveals the live schema/policies without
-- returning user email addresses, access tokens, or other private row data.

-- 1. Table columns, data types, defaults and nullability.
select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'marketplace_listings'
order by c.ordinal_position;

-- 2. Constraints and foreign-key targets.
select
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
where con.conrelid = to_regclass('public.marketplace_listings')
order by con.contype, con.conname;

-- 3. Row-level security state and policies.
select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
where c.oid = to_regclass('public.marketplace_listings');

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('marketplace_listings', 'marketplace_reports')
order by tablename, policyname;

-- 4. Table grants.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('marketplace_listings', 'marketplace_reports')
order by table_name, grantee, privilege_type;

-- 5. Storage buckets and policies. Does not expose object names or file URLs.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars', 'post-media', 'marketplace-images')
order by id;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (coalesce(qual, '') ilike '%marketplace%' or coalesce(with_check, '') ilike '%marketplace%')
order by policyname;


-- 6. If the legacy table already has a status column, report accounts that
-- would need to reconcile more than three active listings before migration.
-- This block is safe even when marketplace_listings or status does not exist.
do $$
declare
  status_column_exists boolean;
  seller_column_exists boolean;
  over_limit_accounts bigint;
begin
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'marketplace_listings'
        and column_name = 'status'
    ),
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'marketplace_listings'
        and column_name = 'seller_id'
    )
  into status_column_exists, seller_column_exists;

  if to_regclass('public.marketplace_listings') is null then
    raise notice 'marketplace_listings does not exist yet; the beta migration will create it.';
  elsif status_column_exists and seller_column_exists then
    execute 'select count(*) from (select seller_id from public.marketplace_listings where status = ''active'' group by seller_id having count(*) > 3) as over_limit' into over_limit_accounts;
    raise notice 'Seller accounts with more than three active listings: %', over_limit_accounts;
  elsif not status_column_exists then
    raise notice 'The legacy table has no status column yet; existing rows will default to active, so review row counts before migration.';
  else
    raise notice 'The legacy table has no seller_id column. Reconcile the schema before applying the beta migration.';
  end if;
end
$$;
