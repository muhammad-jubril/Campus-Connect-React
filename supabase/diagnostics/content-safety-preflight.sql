-- READ-ONLY preflight for Campus Connect reporting/hiding/blocking.
-- Run in the Supabase SQL Editor before applying the migration; save and review results.

-- 1. Verify the core columns expected by current app code.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('profiles','posts','comments','likes','marketplace_listings','marketplace_reports','blocked_users','hidden_posts','content_reports')
order by table_name, ordinal_position;

-- 2. Inspect current RLS state and policies (the migration rebuilds policies on
-- profiles/posts/comments/likes and marketplace_listings to prevent permissive OR bypasses).
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('profiles','posts','comments','likes','marketplace_listings','marketplace_reports','blocked_users','hidden_posts','content_reports')
order by tablename, policyname;

-- 3. Show constraints and deletion rules touching posts/comments/listings/reports.
select rel.relname as table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid=con.conrelid
join pg_namespace ns on ns.oid=rel.relnamespace
where ns.nspname='public'
  and rel.relname in ('profiles','posts','comments','likes','marketplace_listings','marketplace_reports','blocked_users','hidden_posts','content_reports')
order by rel.relname, con.contype, con.conname;

-- 4. Confirm existing functions that provide keyset feed pagination and Marketplace limits.
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('get_feed_posts','enforce_marketplace_listing_rules','validate_marketplace_report','review_content_report','is_user_blocked')
order by p.proname;

-- 5. Inspect the upload buckets and their Storage-object policies. This patch
-- does not change bucket visibility; Marketplace product images currently use
-- a public bucket, so RLS filters listing rows but cannot revoke an image URL
-- already known by another client.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars','post-media','marketplace-images')
order by id;

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='storage' and tablename='objects'
  and (
    coalesce(qual,'') ilike '%avatars%'
    or coalesce(with_check,'') ilike '%avatars%'
    or coalesce(qual,'') ilike '%post-media%'
    or coalesce(with_check,'') ilike '%post-media%'
    or coalesce(qual,'') ilike '%marketplace-images%'
    or coalesce(with_check,'') ilike '%marketplace-images%'
  )
order by policyname;
