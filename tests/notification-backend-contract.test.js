import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/20261012130000_notifications_backend.sql", import.meta.url);
const retryMigrationUrl = new URL("../supabase/migrations/20261012130001_notifications_delivery_retry_hardening.sql", import.meta.url);
const subscriptionUrl = new URL("../supabase/functions/push-subscriptions/index.ts", import.meta.url);
const deliveryUrl = new URL("../supabase/functions/deliver-notification-push/index.ts", import.meta.url);
const contractUrl = new URL("../NOTIFICATIONS-BACKEND-CONTRACT.md", import.meta.url);
const runbookUrl = new URL("../README-NOTIFICATIONS-BACKEND.md", import.meta.url);

test("migration adds only notification integration points and retains one row per source activity", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists parent_comment_id uuid/i);
  assert.match(sql, /create table if not exists public\.follows/i);
  assert.match(sql, /alter table public\.likes\s+add column if not exists activity_id uuid/i);
  assert.match(sql, /add column if not exists source_id uuid/i);
  assert.match(sql, /create unique index if not exists notifications_activity_once_uidx/i);
  assert.match(sql, /create or replace function public\.notify_on_like\(\)/i);
  assert.match(sql, /create or replace function public\.notify_on_comment\(\)/i);
  assert.match(sql, /create or replace function public\.notify_on_follow\(\)/i);
  assert.match(sql, /when v_type = 'reply' then new\.parent_comment_id/i);
  assert.match(sql, /v_thread_id/i);
  assert.match(sql, /not private\.notification_users_blocked/i);
});

test("recipient security allows only SELECT and read-state updates on notifications", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke all on table public\.notifications from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.notifications to authenticated/i);
  assert.match(sql, /grant update \(read\) on table public\.notifications to authenticated/i);
  assert.match(sql, /create policy notifications_select_own[\s\S]*?recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /create policy notifications_update_read_own[\s\S]*?with check \(recipient_id = \(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(sql, /grant insert on table public\.notifications to authenticated/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.notifications/i);
});

test("quiet window is database-serialized and push queue errors do not cancel activity", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /quiet_window_seconds integer not null default 60/i);
  assert.match(sql, /primary key \(recipient_id, notification_type, target_key\)/i);
  assert.match(sql, /clock_timestamp\(\) \+ make_interval\(secs => v_quiet_seconds\)/i);
  assert.match(sql, /on conflict \(recipient_id, notification_type, target_key\) do nothing/i);
  assert.match(sql, /insert into public\.notification_push_outbox/i);
  assert.match(sql, /exception when others then\s+raise warning 'Could not enqueue notification push/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /notification_push_deliveries_pair_unique/i);
  const retry = await readFile(retryMigrationUrl, "utf8");
  assert.match(retry, /'suppressed'/i);
  assert.match(retry, /expire_notification_push_subscriptions/i);
});

test("subscription API derives owner from a valid bearer token and never accepts identity from JSON", async () => {
  const source = await readFile(subscriptionUrl, "utf8");
  assert.match(source, /request\.headers\.get\("Authorization"\)/);
  assert.match(source, /supabase\.auth\.getUser\(match\[1\]\)/);
  assert.match(source, /const userId = await authenticatedUser\(request\)/);
  assert.match(source, /user_id: userId/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /if \(existing && existing\.user_id !== userId\)/);
  assert.match(source, /request\.method === "DELETE"/);
  assert.match(source, /validateEndpoint\(body\.endpoint\)/);
  assert.match(source, /parsed\.protocol !== "https:"/);
  assert.match(source, /validPushHost\(parsed\.hostname\)/);
  assert.doesNotMatch(source, /userId\s*=\s*body\.user_id/);
});

test("delivery worker uses a separate server secret, retries transient errors, retires stale endpoints, and rechecks blocks", async () => {
  const source = await readFile(deliveryUrl, "utf8");
  assert.match(source, /x-internal-push-secret/);
  assert.match(source, /buildPushPayload\(/);
  assert.match(source, /status === 404 \|\| response\.status === 410/);
  assert.match(source, /status: "expired"/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /status: "dead"/);
  assert.match(source, /isCurrentlyBlocked\(row\.recipient_id, row\.actor_id\)/);
  assert.match(source, /isPostHidden\(row\.recipient_id, row\.post_id\)/);
  assert.match(source, /notificationContent\(row, actors\)/);
  assert.match(source, /\/profile\//);
  assert.match(source, /#comments/);
  assert.doesNotMatch(source, /VITE_[A-Z_]+/);
});

test("shared contract and runbook document quiet-window semantics and actual-device test requirements", async () => {
  const contract = await readFile(contractUrl, "utf8");
  const runbook = await readFile(runbookUrl, "utf8");
  for (const field of ["source_id", "comment_id", "thread_id", "profile_id"]) {
    assert.ok(contract.includes(field), `contract should contain ${field}`);
  }
  assert.match(contract, /quiet window/i);
  assert.match(contract, /not a claim of mathematically exactly-once delivery/i);
  assert.match(runbook, /--no-verify-jwt/);
  assert.match(runbook, /VAPID_PRIVATE_KEY/);
  assert.match(runbook, /actual browser\/device/i);
  assert.match(runbook, /service-role value to Vite/i);
});
