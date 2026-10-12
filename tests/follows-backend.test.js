import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20261012164500_follow_operations_and_profile_queries.sql", root);
const existingRelationshipUrl = new URL("supabase/migrations/20261012140543_notifications_relationships.sql", root);
const contractUrl = new URL("NOTIFICATIONS-BACKEND-CONTRACT.md", root);

test("follow operations extend the existing follows table without rebuilding data", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const existing = await readFile(existingRelationshipUrl, "utf8");
  assert.match(existing, /create table if not exists public\.follows/i);
  assert.match(existing, /unique \(follower_id, following_id\)/i);
  assert.match(existing, /check \(follower_id <> following_id\)/i);
  assert.match(existing, /create trigger follows_notify_recipient\s+after insert on public\.follows/i);
  assert.match(sql, /create index if not exists follows_follower_created_idx/i);
  assert.match(sql, /create index if not exists follows_following_created_idx/i);
  assert.doesNotMatch(sql, /drop table\s+public\.follows/i);
  assert.doesNotMatch(sql, /truncate\s+public\.follows/i);
});

test("follow RPC binds identity to auth.uid and makes repeat requests idempotent", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /function public\.follow_student\(p_following_id uuid\)/i);
  assert.match(sql, /v_actor_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /p_following_id = v_actor_id/i);
  assert.match(sql, /public\.is_notification_pair_blocked\(v_actor_id, p_following_id\)/i);
  assert.match(sql, /not public\.is_user_blocked\(f\.follower_id\)/i);
  assert.match(sql, /not public\.is_user_blocked\(f\.following_id\)/i);
  assert.match(sql, /on conflict on constraint follows_follower_following_unique do nothing/i);
  assert.match(sql, /return v_follow_id is not null/i);
  assert.match(sql, /function public\.unfollow_student\(p_following_id uuid\)/i);
  assert.match(sql, /delete from public\.follows\s+where follower_id = v_actor_id\s+and following_id = p_following_id/i);
  assert.match(sql, /return v_deleted > 0/i);
  assert.doesNotMatch(sql, /create trigger .*notification/i);
  assert.doesNotMatch(sql, /insert into public\.notifications/i);
});

test("follow counts and profile lists return accurate count and profile metadata", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /function public\.get_follow_counts\(p_profile_id uuid\)/i);
  assert.match(sql, /followers_count bigint,\s*following_count bigint,\s*is_following boolean,\s*is_followed_by boolean/i);
  assert.match(sql, /function public\.get_followers\([\s\S]*?p_limit integer default 20,\s*p_offset integer default 0/i);
  assert.match(sql, /function public\.get_following\([\s\S]*?p_limit integer default 20,\s*p_offset integer default 0/i);
  for (const field of ["username", "name", "avatar_url", "faculty", "department", "level", "bio", "followed_at", "is_following", "is_followed_by"]) {
    assert.match(sql, new RegExp("\\b" + field + "\\b", "i"));
  }
  assert.match(sql, /or public\.is_user_blocked\(p_profile_id\)/i);
  assert.match(sql, /not public\.is_notification_pair_blocked\(f\.follower_id, f\.following_id\)/i);
  assert.match(sql, /least\(greatest\(coalesce\(p_limit, 20\), 1\), 100\)/i);
});

test("follow mutations are RPC-only for authenticated clients and RPC execution is scoped", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke insert \(following_id\) on table public\.follows from public, anon, authenticated/i);
  assert.match(sql, /revoke delete on table public\.follows from public, anon, authenticated/i);
  for (const fn of ["follow_student", "unfollow_student", "get_follow_counts", "get_followers", "get_following"]) {
    assert.match(sql, new RegExp("revoke all on function public\\." + fn + "\\(", "i"));
    assert.match(sql, new RegExp("grant execute on function public\\." + fn + "\\(", "i"));
  }
  const contract = await readFile(contractUrl, "utf8");
  assert.match(contract, /follow_student/i);
  assert.match(contract, /get_follow_counts/i);
  assert.match(contract, /get_followers/i);
  assert.match(contract, /get_following/i);
});
