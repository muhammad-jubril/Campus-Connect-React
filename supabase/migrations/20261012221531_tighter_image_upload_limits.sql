-- Tighten Storage-side limits to match the first-beta client optimizer.
-- Existing objects are not deleted or rewritten by this migration.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    RAISE EXCEPTION 'Required Supabase Storage bucket "avatars" is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'post-media') THEN
    RAISE EXCEPTION 'Required Supabase Storage bucket "post-media" is missing';
  END IF;
END;
$$;

UPDATE storage.buckets
SET file_size_limit = 153600, -- 150 KiB per avatar
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';

UPDATE storage.buckets
SET file_size_limit = 358400, -- 350 KiB per feed image
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'post-media';

COMMIT;
