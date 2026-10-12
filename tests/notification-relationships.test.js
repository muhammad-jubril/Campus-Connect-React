import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20261012130000_notifications_relationships.sql", root);
const basePipelineUrl = new URL("supabase/migrations/20261012120000_notifications_push_pipeline.sql", root);
const dispatcherUrl = new URL("supabase/functions/dispatch-push-notifications/index.ts", root);
const contractUrl = new URL("NOTIFICATIONS-BACKEND-CONTRACT.md", root);
const setupUrl = new URL("supabase/diagnostics/push-dispatch-setup.md", root);

test("relationship migration keeps the existing notification and push tables", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /alter table public\.comments\s+add column if not exists parent_comment_id uuid/i);
  assert.match(sql, /references public\.comments\(id\)\s+on delete set null/i);
  assert.match(sql, /alter table public\.notifications\s+add column if not exists source_id uuid/i);
  assert.match(sql, /add column if not exists thread_id uuid/i);
  assert.match(sql, /add column if not exists profile_id uuid/i);
  assert.match(sql, /create table if not exists public\.follows/i);
  assert.doesNotMatch(sql, /create table if not exists public\.notifications/i);
  assert.doesNotMatch(sql, /create table if not exists public\.push_notification_queue/i);
});

test("each source activity creates a separately identifiable notification row", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists activity_id uuid not null default gen_random_uuid\(\)/i);
  assert.match(sql, /notifications_source_activity_once_uidx/i);
  assert.match(sql, /on conflict \(recipient_id, type, source_id\).*do nothing/is);
  assert.match(sql, /new\.activity_id/i);
  assert.match(sql, /new\.id, false, coalesce\(new\.created_at, now\(\)\)/i);
});

test("replies resolve to the root thread and top-level comments do not duplicate as replies", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /function public\.notify_on_comment\(\)[\s\S]*?if new\.parent_comment_id is not null then\s+return new/i);
  assert.match(sql, /function public\.notify_on_comment_reply\(\)/i);
  assert.match(sql, /with recursive ancestry\(id, parent_comment_id, depth\)/i);
  assert.match(sql, /where ancestry\.parent_comment_id is null/i);
  assert.match(sql, /comment_id, thread_id, source_id/i);
  assert.match(sql, /v_root_comment_id/i);
  assert.match(sql, /references public\.comments\(id\)\s+on delete set null/i);
});

test("follows derive the follower from auth.uid and apply self-follow/block restrictions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /follower_id uuid not null default auth\.uid\(\)/i);
  assert.match(sql, /unique \(follower_id, following_id\)/i);
  assert.match(sql, /grant insert \(following_id\) on table public\.follows to authenticated/i);
  assert.match(sql, /follower_id = \(select auth\.uid\(\)\)[\s\S]*?following_id <> \(select auth\.uid\(\)\)[\s\S]*?not public\.is_user_blocked\(following_id\)/i);
  assert.match(sql, /function public\.notify_on_follow_relationship\(\)/i);
  assert.match(sql, /type, profile_id, source_id, read, created_at/i);
  assert.match(sql, /public\\.is_notification_pair_blocked\\(new\\.follower_id, new\\.following_id\\)/i);
});

test("notification RLS hides blocked actors and clients can update only read state", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke insert, update on table public\.notifications from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.notifications to authenticated/i);
  assert.match(sql, /grant update \(read\) on table public\.notifications to authenticated/i);
  assert.match(sql, /create policy notifications_select_own[\s\S]*?recipient_id = \(select auth\.uid\(\)\)[\s\S]*?not public\.is_user_blocked\(actor_id\)/i);
  assert.match(sql, /where schemaname = 'public'[\s\S]*?tablename = 'notifications'[\s\S]*?cmd = 'UPDATE'/i);
  assert.match(sql, /create policy notifications_update_read_own[\s\S]*?with check \(recipient_id = \(select auth\.uid\(\)\)\)/i);
});

test("push coalescing uses a configurable quiet window without endangering in-app persistence", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /quiet_window_seconds integer not null default 60/i);
  assert.match(sql, /check \(quiet_window_seconds between 1 and 3600\)/i);
  assert.match(sql, /select c\.quiet_window_seconds/i);
  assert.match(sql, /make_interval\(secs => v_quiet_seconds\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /activity_count = q\.activity_count \+ 1/i);
  assert.match(sql, /notification_push_queue q[\s\S]*?status = 'pending'/i);
  assert.match(sql, /exception when others then[\s\S]*?must never roll back the persisted in-app notification/i);
  assert.match(sql, /reply:thread:/i);
  assert.match(sql, /follow:profile:/i);

  const base = await readFile(basePipelineUrl, "utf8");
  assert.match(base, /for update skip locked/i);
  assert.match(base, /push_delivery_receipts/i);
});

test("dispatcher checks current blocks and hidden-post preferences before sending", async () => {
  const source = await readFile(dispatcherUrl, "utf8");
  assert.match(source, /is_notification_pair_blocked/i);
  assert.match(source, /from\("hidden_posts"\)/i);
  assert.match(source, /target_hidden_by_recipient/i);
  assert.match(source, /PUSH_DISPATCH_SECRET/i);
  assert.match(source, /status === 404 \|\| status === 410/i);
  assert.match(source, /push_delivery_receipts/i);
  assert.match(source, /tag: \`campus-connect:/i);
});

test("contract and runbook clearly separate source, deploy, and real-device verification", async () => {
  const contract = await readFile(contractUrl, "utf8");
  const setup = await readFile(setupUrl, "utf8");
  assert.match(contract, /parent_comment_id/i);
  assert.match(contract, /source_id/i);
  assert.match(contract, /comment_id.*thread_id/i);
  assert.match(contract, /quiet window/i);
  assert.match(contract, /reporting alone does not hide content|reporting an item does not automatically hide it/i);
  assert.match(setup, /actual delivery additionally requires/i);
  assert.match(setup, /supported HTTPS browser\/device/i);
  assert.match(setup, /VAPID_PRIVATE_KEY/);
});
