-- Performance/integrity hardening verified against the live Campus Connect schema.
-- Preflight before enforcing the existing constraint; no rows are changed.
BEGIN;

DO $preflight$
DECLARE
  v_invalid_images bigint;
BEGIN
  IF to_regclass('private.account_deletion_media') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'private'
         AND table_name = 'account_deletion_media'
         AND column_name = 'source_job_id'
     ) THEN
    RAISE EXCEPTION 'Preflight failed: account-deletion media table or source_job_id column is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.marketplace_listings'::regclass
      AND conname = 'marketplace_listings_images_owned_url'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: marketplace image ownership constraint is missing.';
  END IF;

  SELECT count(*) INTO v_invalid_images
  FROM public.marketplace_listings
  WHERE images IS NOT NULL
    AND NOT (
      public.urls_in_own_folder(images, 'marketplace-images', seller_id)
      OR public.urls_in_own_folder(images, 'post-media', seller_id)
    );

  IF v_invalid_images > 0 THEN
    RAISE EXCEPTION 'Refusing to validate marketplace image ownership constraint: % existing row(s) violate it.', v_invalid_images;
  END IF;
END
$preflight$;

CREATE INDEX IF NOT EXISTS account_deletion_media_source_job_id_idx
  ON private.account_deletion_media (source_job_id);

ALTER TABLE public.marketplace_listings
  VALIDATE CONSTRAINT marketplace_listings_images_owned_url;

COMMIT;
