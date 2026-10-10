-- Applied live on 2026-10-07 (Claude, via Supabase connector). Keep in repo for history.
-- A. least privilege
revoke all on public.comments, public.likes, public.marketplace_listings, public.notifications, public.posts, public.profiles from anon;
revoke truncate, references, trigger on public.comments, public.likes, public.marketplace_listings, public.notifications, public.posts, public.profiles from authenticated;
-- B. trigger function not callable from the API
revoke execute on function public.set_post_edited_at() from public, anon, authenticated;
-- C. RLS performance: auth.uid() evaluated once per query
alter policy profiles_insert_own on public.profiles with check ((select auth.uid()) = id);
alter policy profiles_update_own on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy posts_delete_own on public.posts using ((select auth.uid()) = author_id);
alter policy posts_insert_own on public.posts with check ((select auth.uid()) = author_id);
alter policy likes_delete_own on public.likes using ((select auth.uid()) = user_id);
alter policy likes_insert_own on public.likes with check ((select auth.uid()) = user_id);
alter policy comments_insert_own on public.comments with check ((select auth.uid()) = author_id);
alter policy listings_delete_own on public.marketplace_listings using ((select auth.uid()) = seller_id);
alter policy listings_insert_own on public.marketplace_listings with check ((select auth.uid()) = seller_id);
alter policy listings_update_own on public.marketplace_listings using ((select auth.uid()) = seller_id) with check ((select auth.uid()) = seller_id);
alter policy notifications_select_own on public.notifications using ((select auth.uid()) = recipient_id);
alter policy notifications_update_own on public.notifications using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
-- D. profiles: editable columns only
revoke update on public.profiles from authenticated;
grant update (name, faculty, department, level, avatar_url, bio) on public.profiles to authenticated;
-- E. uploaded-file URLs must be in the user's own storage folder
create or replace function public.urls_in_own_folder(urls text[], bucket text, owner uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(u like 'https://annmbmuuiqvutgvvkpet.supabase.co/storage/v1/object/public/' || bucket || '/' || owner::text || '/%'), true)
  from unnest(urls) as u
$$;
alter table public.posts add constraint posts_media_urls_own_folder
  check (media_urls is null or public.urls_in_own_folder(media_urls, 'post-media', author_id));
alter table public.profiles add constraint profiles_avatar_url_own_folder
  check (avatar_url is null or avatar_url like 'https://annmbmuuiqvutgvvkpet.supabase.co/storage/v1/object/public/avatars/' || id::text || '/%');
alter table public.marketplace_listings add constraint listings_images_own_folder
  check (images is null or public.urls_in_own_folder(images, 'post-media', seller_id));
-- F. username_available: strict search_path
create or replace function public.username_available(p_username text)
returns boolean language sql security definer set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username))
$$;
-- G. FK index
create index if not exists marketplace_listings_seller_id_idx on public.marketplace_listings (seller_id);
