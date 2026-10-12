import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20261012195000_settings_account_deletion_backend.sql", root);
const reviewerRedactionMigrationUrl = new URL("supabase/migrations/20261012210000_account_deletion_reviewer_redaction.sql", root);
const preferencesMigrationUrl = new URL("supabase/migrations/20261012180000_settings_notification_preferences.sql", root);
const masterMigrationUrl = new URL("supabase/migrations/20261012180500_notification_preferences_master_push.sql", root);
const preferenceServiceUrl = new URL("src/services/supabase/notificationPreferences.js", root);
const dispatcherUrl = new URL("supabase/functions/dispatch-push-notifications/index.ts", root);
const deletionFunctionUrl = new URL("supabase/functions/delete-account/index.ts", root);
const contractUrl = new URL("SETTINGS-BACKEND-CONTRACT.md", root);

test("notification preferences are per-user, own-row RLS and column-limited", async () => {
  const sql = await readFile(preferencesMigrationUrl, "utf8");
  assert.match(sql, /user_id uuid primary key default auth\.uid\(\)/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /USING \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
  assert.match(sql, /WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
  assert.match(sql, /GRANT UPDATE \(push_likes, push_comments, push_replies, push_follows\)/i);
  assert.doesNotMatch(sql, /GRANT UPDATE ON TABLE public\.notification_preferences TO authenticated/i);
  const master = await readFile(masterMigrationUrl, "utf8");
  assert.match(master, /ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true/i);
  assert.match(master, /GRANT UPDATE \(push_enabled\)/i);
  const service = await readFile(preferenceServiceUrl, "utf8");
  for (const field of ["push_enabled", "push_likes", "push_comments", "push_replies", "push_follows"]) {
    assert.match(service, new RegExp(field));
  }
});

test("trusted dispatcher filters account master and category without deleting in-app activity", async () => {
  const dispatcher = await readFile(dispatcherUrl, "utf8");
  assert.match(dispatcher, /get_notification_push_runtime_config/);
  assert.match(dispatcher, /from\("notification_preferences"\)/);
  assert.match(dispatcher, /select\("push_enabled,push_likes,push_comments,push_replies,push_follows"\)/);
  assert.match(dispatcher, /preferences\?\.push_enabled === false/);
  assert.match(dispatcher, /preferences\?\.\[preferenceField\] === false/);
  assert.match(dispatcher, /user_disabled_push_master/);
  assert.match(dispatcher, /user_disabled_\$\{preferenceField\}/);
  assert.doesNotMatch(dispatcher, /from\("notifications"\)\.delete\(/);
});

test("account deletion derives the principal from verified Auth and requires explicit recent confirmation", async () => {
  const fn = await readFile(deletionFunctionUrl, "utf8");
  assert.match(fn, /authClient\.auth\.getUser\(tokenMatch\[1\]\)/);
  assert.match(fn, /confirmation !== "DELETE_MY_ACCOUNT"/);
  assert.match(fn, /RECENT_AUTH_SECONDS = 10 \* 60/);
  assert.match(fn, /last_sign_in_at/);
  assert.match(fn, /admin\.auth\.admin\.deleteUser\(job\.user_id\)/);
  assert.match(fn, /admin\.auth\.admin\.deleteUser\(job\.user_id, true\)/);
  assert.match(fn, /getUserById\(job\.user_id\)/);
  assert.doesNotMatch(fn, /body\.user_id|body\.userId|body\.account_id|body\.accountId/);
  assert.match(fn, /status: "deleted"/);
  assert.match(fn, /status: "pending"/);
  assert.match(fn, /status: "disabled"/);
});

test("deletion migration has finite moderation retention, safe dependency ordering and no client execution", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["marketplace_listings", "comments", "posts", "likes", "post_views", "follows", "blocked_users", "hidden_posts", "push_notification_queue", "push_delivery_receipts", "push_subscriptions", "notifications", "profiles"]) {
    assert.match(sql, new RegExp("DELETE FROM public\\." + table + "\\b", "i"));
  }
  assert.match(sql, /reporter_id DROP NOT NULL/i);
  assert.match(sql, /ON DELETE SET NULL/i);
  assert.match(sql, /retention_expires_at = now\(\)\s*\+\s*interval '180 days'/i);
  assert.match(sql, /purge_expired_account_deletion_reports/);
  assert.match(sql, /campus-connect-account-deletion-retention/);
  assert.match(sql, /campus-connect-account-deletion-recovery/);
  assert.match(sql, /create table if not exists private\.account_deletion_jobs/i);
  assert.match(sql, /create table if not exists private\.account_deletion_media/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.apply_account_deletion_database_cleanup\(uuid\) TO service_role/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_account_deletion_database_cleanup\(uuid\) FROM PUBLIC,anon,authenticated/i);
  assert.match(sql, /active_campus_account_required/);
  assert.match(sql, /can_create_campus_profile\(\)/);
  assert.doesNotMatch(sql, /FOREACH t IN ARRAY ARRAY\[\s*'profiles'/);
  assert.match(sql, /user_id IS NULL/);
  assert.match(sql, /interval '30 days'/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.apply_account_deletion_database_cleanup\(uuid\) TO authenticated/i);
  const reviewerMigration = await readFile(reviewerRedactionMigrationUrl, "utf8");
  assert.match(reviewerMigration, /OR r\.reviewed_by=v_user_id/);
  assert.match(reviewerMigration, /moderator_notes = CASE WHEN .*r\.reviewed_by=v_user_id/);
});

test("storage cleanup is owner-folder-scoped and checks shared references before removal", async () => {
  const fn = await readFile(deletionFunctionUrl, "utf8");
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(fn, /MEDIA_BUCKETS = \["avatars", "post-media", "marketplace-images"\]/);
  assert.match(fn, /objectPath\.startsWith/);
  assert.match(fn, /account_deletion_media_is_referenced/);
  assert.match(fn, /admin\.storage\.from\(bucket\)\.remove\(\[objectPath\]\)/);
  assert.match(fn, /processDeferredMedia/);
  assert.match(migration, /public\.account_deletion_media_is_referenced/);
  assert.match(migration, /ON CONFLICT\(bucket_id,object_path\)/);
});

test("contract describes finite retention and does not overstate complete deletion", async () => {
  const contract = await readFile(contractUrl, "utf8");
  assert.match(contract, /status.*disabled.*not as full hard deletion/i);
  assert.match(contract, /180 days/);
  assert.match(contract, /hard deletion/i);
  assert.match(contract, /frontend must expose the account-wide/i);
});
