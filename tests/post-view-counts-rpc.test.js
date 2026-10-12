import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const countMigrationUrl = new URL("supabase/migrations/20261012232526_post_view_counts_for_feed.sql", root);
const recordMigrationUrl = new URL("supabase/migrations/20261012040129_content_safety_ownership_and_view_guards.sql", root);
const baseViewMigrationUrl = new URL("supabase/migrations/20261010231946_post_views.sql", root);

test("aggregate post-view RPC returns typed counts and requires an authenticated active account", async () => {
  const sql = await readFile(countMigrationUrl, "utf8");
  assert.match(sql, /function public\.get_post_view_counts\(p_post_ids uuid\[\]\)/i);
  assert.match(sql, /returns table \(post_id uuid, view_count bigint\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /v_uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(sql, /if v_uid is null then[\s\S]*?errcode = '28000'/i);
  assert.match(sql, /if not public\.is_active_campus_account\(\) then[\s\S]*?errcode = '42501'/i);
});

test("aggregate post-view RPC bounds batches, preserves post visibility and returns zero-count rows", async () => {
  const sql = await readFile(countMigrationUrl, "utf8");
  assert.match(sql, /cardinality\(p_post_ids\), 0\) > 100/i);
  assert.match(sql, /at most 100 posts can be queried at once/i);
  assert.match(sql, /select p\.id, count\(pv\.viewer_id\)::bigint/i);
  assert.match(sql, /left join public\.post_views pv on pv\.post_id = p\.id/i);
  assert.match(sql, /p\.author_id = v_uid[\s\S]*?not public\.is_user_blocked\(p\.author_id\)[\s\S]*?from public\.hidden_posts h[\s\S]*?h\.user_id = v_uid and h\.post_id = p\.id/i);
  assert.match(sql, /revoke all on function public\.get_post_view_counts\(uuid\[\]\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_post_view_counts\(uuid\[\]\) to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+select[^;]*post_views/i);
  assert.doesNotMatch(sql, /insert into public\.post_views/i);
});

test("unique view recording remains separate and idempotent per account/post", async () => {
  const [base, guarded] = await Promise.all([
    readFile(baseViewMigrationUrl, "utf8"),
    readFile(recordMigrationUrl, "utf8"),
  ]);
  assert.match(base, /primary key \(post_id, viewer_id\)/i);
  assert.match(guarded, /on conflict \(post_id, viewer_id\) do nothing/i);
  assert.match(guarded, /function public\.record_post_view\(p_post_id uuid\)/i);
  assert.doesNotMatch(await readFile(countMigrationUrl, "utf8"), /create or replace function public\.record_post_view/i);
});
