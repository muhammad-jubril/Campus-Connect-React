import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { groupNotifications } from "../src/utils/notificationGrouping.js";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20261012140537_notifications_push_pipeline.sql", root);
const subscribeUrl = new URL("supabase/functions/push-subscriptions/index.ts", root);
const dispatchUrl = new URL("supabase/functions/dispatch-push-notifications/index.ts", root);
const setupUrl = new URL("supabase/diagnostics/push-dispatch-setup.md", root);
const pushClientUrl = new URL("src/services/pushNotifications.js", root);

function row(id, type, createdAt, extra = {}) {
  return {
    id,
    type,
    created_at: createdAt,
    actor_id: `actor-${id}`,
    actor: { id: `actor-${id}`, name: `Student ${id}` },
    read: false,
    ...extra,
  };
}

test("notifications migration supports all four canonical types and serializes group queue writes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /check \(type in \('like', 'comment', 'reply', 'follow'\)\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /push_notification_queue_pending_group_uq/i);
  assert.match(sql, /activity_count = q\.activity_count \+ 1/i);
  assert.match(sql, /latest_notification_id = case when new\.created_at >= q\.last_activity_at/i);
});

test("push quiet window preserves the first event deadline and retry backoff when batches merge", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /new\.created_at \+ interval '60 seconds'/i);
  assert.match(sql, /deliver_after=greatest\(q\.deliver_after, now\(\)\+make_interval\(secs=>v_seconds\)\)/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /make_interval\(secs=>v_seconds\)/i);
});

test("private subscription/queue tables and management RPCs are service-role only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /alter table public\.push_subscriptions enable row level security/i);
  assert.match(sql, /revoke all on public\.push_notification_queue, public\.push_subscriptions, public\.push_delivery_receipts from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.register_push_subscription\(uuid,text,text,text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.register_push_subscription\(uuid,text,text,text\) to service_role/i);
  assert.match(sql, /is_notification_pair_blocked\(new\.recipient_id, new\.actor_id\)/i);
});

test("subscription CORS explicitly allows the live production origin", async () => {
  const source = await readFile(subscribeUrl, "utf8");
  assert.match(source, /https:\/\/mycampusconnectt\.vercel\.app/);
  assert.match(source, /DEFAULT_ALLOWED_ORIGINS/);
  assert.match(source, /ENV_ALLOWED_ORIGINS/);
  assert.match(source, /Access-Control-Allow-Origin/);
});

test("subscription endpoint verifies the session, derives user ID server-side and validates push endpoints", async () => {
  const source = await readFile(subscribeUrl, "utf8");
  assert.match(source, /auth\.getUser\(tokenMatch\[1\]\)/);
  assert.match(source, /p_user_id: authData\.user\.id/);
  assert.doesNotMatch(source, /p_user_id:\s*body\.user_id/i);
  assert.match(source, /endpoint\.protocol !== "https:"/);
  assert.match(source, /host === "fcm\.googleapis\.com"/);
  assert.match(source, /keys\?\.p256dh/);
  const client = await readFile(pushClientUrl, "utf8");
  assert.match(client, /isTrustedPushEndpoint/);
  assert.match(client, /endpoint\.origin === supabase\.origin/);
  assert.match(client, /functions\/v1\/push-subscriptions/);
  assert.match(client, /apikey: import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
});

test("logout deregisters server push before auth clears and clears local subscription on cross-tab signout", async () => {
  const auth = await readFile(new URL("src/context/AuthContext.jsx", root), "utf8");
  const client = await readFile(pushClientUrl, "utf8");
  assert.match(auth, /await cleanupPushSubscriptionForLogout\(currentUser\?\.id \|\| null\);[\s\S]*await supabaseSignOut/);
  assert.match(auth, /void cleanupLocalPushSubscription\(\)/);
  assert.match(client, /cleanupPushSubscriptionForLogout/);
  assert.match(client, /cleanupLocalPushSubscription/);
});

test("mark-all-read refreshes the server snapshot instead of marking racing inserts locally read", async () => {
  const provider = await readFile(new URL("src/hooks/useNotifications.jsx", root), "utf8");
  assert.match(provider, /await markAllNotificationsRead\(userId\);[\s\S]*await refreshNotifications\(\{ includeList: true \}\)/);
  assert.doesNotMatch(provider, /setNotifications\(\(previous\) => previous\.map\(\(item\) => \(\{ \.\.\.item, read: true \}\)\)\)/);
});

test("push sender guards scheduled invocations, suppresses blocked users, cleans expired subscriptions and retries", async () => {
  const source = await readFile(dispatchUrl, "utf8");
  assert.match(source, /get_notification_push_runtime_config/);
  assert.match(source, /p_dispatch_secret: suppliedDispatchSecret/);
  assert.match(source, /x-push-dispatch-secret/);
  assert.doesNotMatch(source, /Deno\\.env\\.get\\("PUSH_DISPATCH_SECRET"\\)/);
  assert.doesNotMatch(source, /Deno\\.env\\.get\\("VAPID_PRIVATE_KEY"\\)/);
  assert.match(source, /is_notification_pair_blocked/);
  assert.match(source, /status === 404 \|\| status === 410/);
  assert.match(source, /push_subscriptions.*delete|from\("push_subscriptions"\)\.delete/s);
  assert.match(source, /retryable_failure/);
  assert.match(source, /push_delivery_receipts/);
  assert.match(source, /tag: `campus-connect:/);
  const setup = await readFile(setupUrl, "utf8");
  assert.match(setup, /Never put the private key in a `VITE_\*` variable/i);
  assert.match(setup, /60 seconds/);
});

test("follow grouping does not merge records with invalid or missing timestamps", () => {
  const groups = groupNotifications([
    row("bad-a", "follow", null),
    row("bad-b", "follow", "not-a-date"),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.items.length === 1));
});
