-- Size/type limits for user uploads + let users delete their own files.
-- App must show a friendly message when an upload is rejected (size/type).
begin;

update storage.buckets
set file_size_limit = 2097152,   -- 2 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 52428800,  -- 50 MB (free-plan ceiling)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp',
                               'video/mp4', 'video/webm', 'video/quicktime']
where id = 'post-media';

drop policy if exists avatars_delete_own_folder on storage.objects;
create policy avatars_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists post_media_delete_own_folder on storage.objects;
create policy post_media_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
