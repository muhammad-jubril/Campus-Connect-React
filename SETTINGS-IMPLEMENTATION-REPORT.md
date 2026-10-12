# Campus Connect Backend Reconciliation — 12 October 2026

## Scope

This report covers the Campus Connect application and its connected Supabase project only. The separate site's news and gallery tables and storage buckets are not part of this application and were intentionally excluded.

## Changes prepared in this branch

- Restored the migration source matching the live push pipeline, relationship notifications, Vault-backed dispatcher configuration, account-wide notification preferences, and account deletion workflow.
- Renamed/reconciled migration files to match live migration-history versions, removing stale duplicate versions from the migration source. The marketplace beta migration already enforces the title and description limits; a separate duplicate text-limit trigger was removed from the canonical migration set.
- Restored the deployed `supabase/functions/delete-account/index.ts` source. The Settings control remains disabled: the workflow must first pass end-to-end validation against a disposable Campus Connect account, including failure/retry behavior and storage cleanup.
- Added a persisted `push_enabled` account master switch in Settings and in the preference service. This is distinct from the existing device/browser subscription switch. The dispatcher is expected to check the account master and the four category preferences immediately before Web Push delivery.
- Added the live upload-budget migration to the canonical source history: avatars are limited to 153,600 bytes (150 KiB), feed images to 358,400 bytes (350 KiB), and both accept JPEG, PNG, or WebP. Existing objects are preserved.
- Added a data-preserving database hygiene migration for the missing account-deletion media foreign-key index and validation of the marketplace image-ownership constraint. Live rows were checked before the constraint was validated.
- Added regression contract tests and transactional follow-operation diagnostics.

## Live database changes made and verified

1. `storage.buckets`: `avatars.file_size_limit = 153600`; `post-media.file_size_limit = 358400`. Both retain the JPEG/PNG/WebP allowlist. The settings affect future uploads; old objects were not deleted or rewritten.
2. `private.account_deletion_media_source_job_id_idx` was created to cover the `source_job_id` foreign key.
3. `public.marketplace_listings_images_owned_url` was validated after a preflight confirmed that existing marketplace rows did not violate its predicate.

No live account data was deleted or rewritten by these maintenance migrations. No Edge Function was redeployed by this reconciliation.

## Still requires external or end-to-end verification

- Run CI (`npm test`, `npm run lint`, `npm run build`) for the resulting branch and resolve any failures.
- Test category and account-wide preference behavior using separate test accounts, then verify real device delivery on HTTPS. Source tests do not prove delivery.
- Run the secure account-deletion flow with a disposable account, test partial failures/retry/idempotency and storage cleanup, and only then decide whether to enable the Settings control.
- Supabase's leaked-password protection remains disabled in live Auth configuration. It requires changing the Auth security setting in the Supabase dashboard; no Auth configuration setter was available through the connected tooling.
- Re-run Supabase security/performance advisors and distinguish intentional service-only SECURITY DEFINER RPCs from any RPCs that should not be executable by client roles. Do not revoke the follow, comment-deletion, block-state, or moderation RPCs without checking their caller contract.
- Unused-index advisor warnings are not treated as automatic drop recommendations on this young database; measure query workload before removing indexes.

## Validation boundary

The migration changes above were applied to and verified on the connected Campus Connect Supabase project. Browser push delivery, multi-user row-level security, and end-to-end account deletion have not been represented as tested. The account-deletion UI therefore remains gated off.
