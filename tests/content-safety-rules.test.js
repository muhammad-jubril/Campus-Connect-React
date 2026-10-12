import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_CONTENT_REPORT_DETAILS,
  REPORT_REASONS,
  isBlockPair,
  validateContentReportDraft,
} from "../src/utils/contentSafetyRules.js";

const migrationUrl = new URL("../supabase/migrations/20261012150000_content_reporting_hiding_blocking.sql", import.meta.url);
const menuUrl = new URL("../src/components/safety/ContentSafetyMenu.jsx", import.meta.url);
const patcherUrl = new URL("../scripts/apply-content-safety-patch.mjs", import.meta.url);
const moderationPageUrl = new URL("../src/pages/ModerationReportsPage.jsx", import.meta.url);
const preflightUrl = new URL("../supabase/diagnostics/content-safety-preflight.sql", import.meta.url);

test("each report target has relevant reason options", () => {
  assert.ok(REPORT_REASONS.post.some((reason) => reason.value === "spam_scams"));
  assert.ok(REPORT_REASONS.comment.some((reason) => reason.value === "harassment_bullying"));
  assert.ok(REPORT_REASONS.reply.some((reason) => reason.value === "threats_violence"));
  assert.ok(REPORT_REASONS.account.some((reason) => reason.value === "impersonation"));
  assert.equal(REPORT_REASONS.post.some((reason) => reason.value === "impersonation"), false);
});

test("report draft trims optional explanation and preserves exact target identity", () => {
  assert.deepEqual(validateContentReportDraft({
    targetType: "reply", targetId: "reply-123", reason: "spam_scams", details: "  repeated spam  ",
  }), { targetType: "reply", reason: "spam_scams", details: "repeated spam" });
  assert.equal(validateContentReportDraft({
    targetType: "post", targetId: "post-1", reason: "other", details: "   ",
  }).details, null);
});

test("report drafts reject unrelated reasons, invalid targets and oversized explanations", () => {
  assert.throws(() => validateContentReportDraft({ targetType: "post", reason: "impersonation" }), /reason that applies/);
  assert.throws(() => validateContentReportDraft({ targetType: "listing", reason: "other" }), /valid item/);
  assert.throws(() => validateContentReportDraft({ targetType: "account", reason: "other", details: "x".repeat(MAX_CONTENT_REPORT_DETAILS + 1) }), /800 characters/);
});

test("a block applies in both directions but never to self or an unknown account", () => {
  const blocks = [{ blocker_id: "alice", blocked_id: "bob" }];
  assert.equal(isBlockPair(blocks, "alice", "bob"), true);
  assert.equal(isBlockPair(blocks, "bob", "alice"), true);
  assert.equal(isBlockPair(blocks, "alice", "alice"), false);
  assert.equal(isBlockPair(blocks, null, "bob"), false);
  assert.equal(isBlockPair(blocks, "alice", "carol"), false);
});

test("database migration limits block lookup to the signed-in user's relationship", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /function public\.is_user_blocked\(p_other_user uuid\)/i);
  assert.match(sql, /b\.blocker_id = \(select auth\.uid\(\)\).*b\.blocked_id = p_other_user/is);
  assert.match(sql, /b\.blocker_id = p_other_user.*b\.blocked_id = \(select auth\.uid\(\)\)/is);
  assert.match(sql, /revoke all on function public\.is_user_blocked\(uuid\) from public, anon/i);
});

test("database migration covers hidden content, mutual visibility, rate-limited reports and reviewer-only RPCs", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.hidden_posts/i);
  assert.match(sql, /create table if not exists public\.blocked_users/i);
  assert.match(sql, /unique \(reporter_id, target_type, target_id\)/i);
  assert.match(sql, /unique index if not exists content_reports_comment_reply_duplicate_guard[\s\S]*where target_type in \('comment','reply'\)/i);
  assert.match(sql, /v_recent_count >= 10/i);
  assert.match(sql, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'/i);
  assert.doesNotMatch(sql, /auth\.jwt\(\) -> 'user_metadata'/i);
  assert.match(sql, /function public\.list_content_reports/i);
  assert.match(sql, /function public\.review_content_report/i);
  assert.match(sql, /not public\.is_user_blocked\(seller_id\)/i);
  assert.match(sql, /create policy posts_select_visible/i);
  assert.match(sql, /create policy comments_select_visible/i);
  assert.match(sql, /create policy likes_insert_unblocked/i);
  assert.match(sql, /create policy profiles_select_unblocked/i);
  assert.match(sql, /grant insert \(blocked_id\) on public\.blocked_users to authenticated/i);
  assert.match(sql, /grant insert \(post_id\) on public\.hidden_posts to authenticated/i);
  assert.match(sql, /-- There is deliberately no authenticated UPDATE or DELETE policy on reports/i);
  const preflight = await readFile(preflightUrl, "utf8");
  assert.match(preflight, /from storage\.buckets/i);
  assert.match(preflight, /marketplace-images/i);
  assert.match(preflight, /from pg_policies/i);
});


test("shared action menu exposes report, hide, block and confirmed-delete integration points", async () => {
  const menu = await readFile(menuUrl, "utf8");
  const patcher = await readFile(patcherUrl, "utf8");
  assert.match(menu, /action: "report"/);
  assert.match(menu, /action: "hide"/);
  assert.match(menu, /action: "block"/);
  assert.match(menu, /action: "delete"/);
  assert.match(menu, /You and this person will no longer see each other's posts/);
  assert.match(patcher, /Use one comment action menu with report\/block and confirmed deletion/);
  assert.match(patcher, /Require confirmation before permanently deleting a reply/);
  assert.match(patcher, /loadRequestRef\.current \+= 1/);
  assert.match(patcher, /loadMoreInFlightRef\.current = false/);
  assert.match(patcher, /loadedRef\.current = false/);
  assert.match(patcher, /if \(current\.includes\(operation\.after\)\) continue/);
  assert.match(patcher, /if \(post\?\.authorId === blockedUserId\) \{/);
  assert.match(patcher, /bumpCommentCount\(post\.id, -removedCount\)/);
  assert.match(patcher, /adjustCommentCount\(-removedCount\)/);
});

test("content-safety patch does not overwrite the existing feed scroll-restoration utility", async () => {
  const patcher = await readFile(patcherUrl, "utf8");
  assert.doesNotMatch(patcher, /src\/utils\/feedScrollPosition\.js/);
  assert.doesNotMatch(patcher, /src\/styles\/shell\.css/);
});

test("moderation queue is server-gated and report records do not cascade with target deletion", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /target_id uuid not null,/i);
  const reportTableDefinition = sql.split("create table if not exists public.content_reports (")[1]?.split("\n);")[0] || "";
  assert.doesNotMatch(reportTableDefinition, /target_id uuid[^,]*references/i);
  assert.match(sql, /if not public\.is_content_moderator\(\) then raise exception 'Moderator access required\.'/i);
  assert.match(sql, /on delete cascade/); // user-owned preferences only; target report IDs themselves deliberately have no FK
});


test("moderation evidence includes reported image URLs without exposing them in ordinary report column grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const page = await readFile(moderationPageUrl, "utf8");
  assert.match(sql, /target_media_urls text\[\] not null default/i);
  assert.match(sql, /target_image_url text null/i);
  assert.match(sql, /case when p\.media_type='image' then coalesce\(p\.media_urls\[1:4\]/i);
  assert.match(sql, /grant select \(id, target_type, target_id, reported_user_id, reason, details, target_excerpt, status, created_at\)/i);
  assert.match(page, /report\.target_media_urls/);
  assert.match(page, /report\.target_image_url/);
});
