-- Tighten Storage-side limits to match the first-beta client optimizer.
-- Existing objects are not deleted or rewritten by this migration.
begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'avatars') then
    raise exception 'Required Supabase Storage bucket "avatars" is missing';
  end if;
  if not exists (select 1 from storage.buckets where id = 'post-media') then
    raise exception 'Required Supabase Storage bucket "post-media" is missing';
  end if;
end;
$$;

update storage.buckets
set file_size_limit = 153600, -- 150 KiB per avatar
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 358400, -- 350 KiB per feed image
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'post-media';

commit;
