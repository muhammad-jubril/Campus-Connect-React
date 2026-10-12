import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeFollowError } from "../src/utils/followRelationshipErrors.js";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20261012170000_profile_following_backend.sql", root);
const profileUrl = new URL("src/pages/ProfilePage.jsx", root);
const serviceUrl = new URL("src/services/supabase/profileFollows.js", root);
const listPageUrl = new URL("src/pages/ProfileConnectionsPage.jsx", root);

test("missing follow table is reported as pending backend integration, not as zero counts", () => {
  const error = normalizeFollowError({
    code: "42P01",
    message: 'relation "public.follows" does not exist',
  });
  assert.match(error.message, /backend needs to deploy the follows table/i);
});

test("permission errors preserve the backend restriction message", () => {
  const error = normalizeFollowError({ code: "42501", message: "Follow blocked by privacy policy." });
  assert.equal(error.message, "Follow blocked by privacy policy.");
});

test("ordinary errors remain actionable and are not converted to missing-schema errors", () => {
  const original = new Error("Temporary network failure");
  assert.equal(normalizeFollowError(original), original);
});

test("profile page renders server-backed follower/following counts and list navigation", async () => {
  const page = await readFile(profileUrl, "utf8");
  assert.match(page, /getProfileFollowSummary\(person\.id, currentUser\.id\)/);
  assert.match(page, /connectionCount\("followers"\)/);
  assert.match(page, /connectionCount\("following"\)/);
  assert.match(page, /openConnectionList\("followers"\)/);
  assert.match(page, /openConnectionList\("following"\)/);
  assert.match(page, /setFollowRetryKey\(\(key\) => key \+ 1\)/);
  assert.match(page, /setFollowSummaryError/);
});

test("connection lists navigate to profiles and preserve loading, empty, error and pagination states", async () => {
  const page = await readFile(listPageUrl, "utf8");
  assert.match(page, /Loading \{pageTitle\.toLowerCase\(\)\}/);
  assert.match(page, /emptyListState\(connectionType, pageState\.owner\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /to=\{person\.username === currentUser\?\.username/);
  assert.match(page, /Load more/);
});

test("follow service does not trust a client-provided follower id on insert", async () => {
  const service = await readFile(serviceUrl, "utf8");
  const insertBlock = service.split("export async function followStudent")[1]?.split("export async function unfollowStudent")[0] || "";
  assert.match(insertBlock, /insert\(\{\s*following_id:\s*targetId,?\s*\}\)/);
  assert.doesNotMatch(insertBlock, /follower_id:\s*viewerId/);
});

test("follow migration protects unique edges and blocks access to relationships involving blocked users", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.follows/i);
  assert.match(sql, /unique \(follower_id, following_id\)/i);
  assert.match(sql, /check \(follower_id <> following_id\)/i);
  assert.match(sql, /revoke all on table public\.follows from public, anon, authenticated/i);
  assert.match(sql, /revoke all \(%I\) on table public\.follows from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+update[\s\S]{0,100}public\.follows/i);
  assert.match(sql, /grant insert \(following_id\) on table public\.follows to authenticated/i);
  assert.match(sql, /follower_id=\(select auth\.uid\(\)\)/i);
  assert.match(sql, /not public\.is_user_blocked\(follower_id\)[\s\S]*not public\.is_user_blocked\(following_id\)/i);
  assert.match(sql, /create policy follows_delete_self[\s\S]*using \(follower_id=\(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /create trigger follows_notify_recipient[\s\S]*after insert on public\.follows/i);
  assert.match(sql, /source_id[\s\S]*notifications_source_activity_once_uidx/i);
});

test("connection pagination has a stable timestamp tie-breaker backed by the migration indexes", async () => {
  const [service, sql] = await Promise.all([
    readFile(serviceUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
  ]);
  assert.match(service, /select\("id,follower_id,following_id,created_at", \{ count: "exact" \}\)/);
  assert.match(service, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  assert.match(sql, /follows_following_created_idx[\s\S]*following_id, created_at DESC, id DESC, follower_id/i);
  assert.match(sql, /follows_follower_created_idx[\s\S]*follower_id, created_at DESC, id DESC, following_id/i);
});
