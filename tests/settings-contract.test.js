import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const settingsUrl = new URL("src/pages/SettingsPage.jsx", root);
const pushServiceUrl = new URL("src/services/pushNotifications.js", root);
const routesUrl = new URL("src/routes/AppRoutes.jsx", root);
const drawerUrl = new URL("src/components/layout/Drawer.jsx", root);
const preferenceServiceUrl = new URL("src/services/supabase/notificationPreferences.js", root);
const preferenceMigrationUrl = new URL("supabase/migrations/20261012203746_settings_notification_preferences.sql", root);
const dispatcherUrl = new URL("supabase/functions/dispatch-push-notifications/index.ts", root);
const contractUrl = new URL("SETTINGS-BACKEND-CONTRACT.md", root);

 test("Settings route replaces the placeholder without moving the hamburger entry", async () => {
  const [routes, drawer] = await Promise.all([
    readFile(routesUrl, "utf8"),
    readFile(drawerUrl, "utf8"),
  ]);
  assert.match(routes, /import SettingsPage from "\.\.\/pages\/SettingsPage"/);
  assert.match(routes, /path="\/settings" element={<ScreenLayout><SettingsPage \/><\/ScreenLayout>}/);
  assert.match(drawer, /onClick=\{\(\) => go\("\/settings"\)\}/);
});

test("push categories load and save through Supabase rather than browser-only state", async () => {
  const [page, service] = await Promise.all([
    readFile(settingsUrl, "utf8"),
    readFile(preferenceServiceUrl, "utf8"),
  ]);
  for (const field of ["push_enabled", "push_likes", "push_comments", "push_replies", "push_follows"]) {
    assert.match(page, new RegExp(field));
    assert.match(service, new RegExp(field));
  }
  assert.match(service, /\.from\(TABLE\)[\s\S]*?\.select\(COLUMNS\)/);
  assert.match(service, /\.update\(\{ \[field\]: value \}\)/);
  assert.match(service, /\.eq\("user_id", userId\)/);
  assert.match(service, /user_id is deliberately omitted/i);
});

test("notification preferences have own-row RLS, column-limited writes and server update time", async () => {
  const sql = await readFile(preferenceMigrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.notification_preferences/i);
  assert.match(sql, /user_id uuid primary key default auth\.uid\(\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /grant insert \(push_likes, push_comments, push_replies, push_follows\)/i);
  assert.doesNotMatch(sql, /grant insert on table public\.notification_preferences to authenticated/i);
  assert.match(sql, /set_notification_preferences_updated_at/i);
  assert.match(sql, /from public\.push_subscriptions/i);
});

test("push dispatcher enforces persisted category preferences without deleting in-app rows", async () => {
  const [dispatcher, contract] = await Promise.all([
    readFile(dispatcherUrl, "utf8"),
    readFile(contractUrl, "utf8"),
  ]);
  assert.match(dispatcher, /from\("notification_preferences"\)/);
  assert.match(dispatcher, /like: "push_likes"/);
  assert.match(dispatcher, /comment: "push_comments"/);
  assert.match(dispatcher, /reply: "push_replies"/);
  assert.match(dispatcher, /follow: "push_follows"/);
  assert.match(dispatcher, /preferences\?\.\[preferenceField\] === false/);
  assert.match(dispatcher, /preferences\?\.push_enabled === false/);
  assert.match(dispatcher, /user_disabled_push_master/);
  assert.match(contract, /underlying `public\.notifications` rows[\s\S]*?remain unchanged/i);
});

test("account deletion requires explicit confirmation and server-confirmed completion", async () => {
  const [page, contract] = await Promise.all([
    readFile(settingsUrl, "utf8"),
    readFile(contractUrl, "utf8"),
  ]);
  assert.match(page, /role="dialog"/);
  assert.match(page, /deletePhrase\.trim\(\) !== "DELETE"/);
  assert.match(page, /deleteAcknowledged/);
  assert.match(page, /supabase\.functions\.invoke\("delete-account"/);
  assert.match(page, /data\?\.status !== "deleted"/);
  assert.match(page, /ACCOUNT_DELETION_BACKEND_READY = false/);
  assert.match(page, /disabled={!ACCOUNT_DELETION_BACKEND_READY}/);
  assert.match(page, /the workflow must pass an end-to-end test with a disposable Campus Connect account/);
  assert.doesNotMatch(page, /\.from\(["'](?:profiles|posts|comments|auth\.users)["']\)\.delete\(/);
  assert.match(contract, /must remain unavailable in the UI until a successful end-to-end test with a disposable Campus Connect account/i);
  assert.match(contract, /status.*deleted/i);
});


test("Settings distinguishes browser permission from local and backend-verified push subscription", async () => {
  const [page, pushService] = await Promise.all([
    readFile(settingsUrl, "utf8"),
    readFile(pushServiceUrl, "utf8"),
  ]);
  assert.match(page, /Browser permission/);
  assert.match(page, /Device subscription/);
  assert.match(page, /subscriptionStatus === "present"/);
  assert.match(pushService, /permission === "denied"[\s\S]*?subscriptionStatus: subscription \? "present" : "absent"/);
  assert.match(page, /aria-labelledby="settings-notifications-title"/);
  assert.match(page, /<h2 id=\{id\}>\{title\}<\/h2>/);
});

test("Settings handlers guard against duplicate preference, push, and destructive requests", async () => {
  const page = await readFile(settingsUrl, "utf8");
  assert.match(page, /savingPreferenceRef\.current/);
  assert.match(page, /pushBusyRef\.current/);
  assert.match(page, /deletingAccountRef\.current/);
});


test("opening or refreshing Settings does not silently recreate a deleted or expired device subscription", async () => {
  const [page, client, endpoint] = await Promise.all([
    readFile(settingsUrl, "utf8"),
    readFile(pushServiceUrl, "utf8"),
    readFile(new URL("supabase/functions/push-subscriptions/index.ts", root), "utf8"),
  ]);
  assert.match(page, /"not-registered": "Browser subscription is not registered with the backend"/);
  assert.match(page, /renewExisting: pushState\.status === "not-registered"/);
  const statusReader = client.slice(client.indexOf("export async function getPushStatus"), client.indexOf("export async function enablePushNotifications"));
  assert.match(statusReader, /isSubscriptionRegistered\(subscription, userId\)/);
  assert.doesNotMatch(statusReader, /sendSubscriptionToBackend\("PUT"/);
  assert.match(endpoint, /request\.method === "GET"[\s\S]*?eq\("user_id", authData\.user\.id\)[\s\S]*?eq\("endpoint", endpoint\)/);
  assert.match(client, /sendSubscriptionToBackend\("DELETE", subscription, userId\);[\s\S]*?subscription\.unsubscribe\(\)[\s\S]*?pushManager\.subscribe\(\{/);
});
