-- DRAFT — NOT APPLIED. Claude applies this after the auth verification is finished
-- and the app (Task List 04) no longer sends video or oversized images.
-- Goal: keep Campus Connect inside the Supabase free plan (images only, small files, max 3 per post).
begin;

-- Posts: images only, max 3 per post (existing rows already comply)
alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check
  check (media_type is null or media_type = 'image');

alter table public.posts drop constraint if exists posts_media_urls_max;
alter table public.posts add constraint posts_media_urls_max
  check (media_urls is null or array_length(media_urls, 1) <= 3);

-- Marketplace listings: same cap
alter table public.marketplace_listings drop constraint if exists listings_images_max;
alter table public.marketplace_listings add constraint listings_images_max
  check (images is null or array_length(images, 1) <= 3);

-- Buckets: images only, small files (the app compresses to ~40 KB avatars / ~150 KB post images)
update storage.buckets
set file_size_limit = 204800,   -- 200 KB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 524288,   -- 500 KB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'post-media';

commit;
