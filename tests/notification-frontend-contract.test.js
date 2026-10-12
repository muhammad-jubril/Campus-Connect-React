import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCommentDepth } from "../src/utils/commentThreads.js";

const root = new URL("../", import.meta.url);

test("comment service persists and reads the immediate reply parent", async () => {
  const source = await readFile(new URL("src/services/supabase/comments.js", root), "utf8");
  assert.match(source, /select\("id, post_id, author_id, text, created_at, parent_comment_id"\)/);
  assert.match(source, /parentCommentId: row\.parent_comment_id \|\| null/);
  assert.match(source, /parent_comment_id = parentCommentId/);
  assert.match(source, /export async function addComment\(\{ postId, authorId, text, parentCommentId = null \}\)/);
});

test("post detail and comment modal let a user target an existing comment or reply", async () => {
  const [detail, modal] = await Promise.all([
    readFile(new URL("src/pages/PostDetailPage.jsx", root), "utf8"),
    readFile(new URL("src/components/feed/CommentsModal.jsx", root), "utf8"),
  ]);
  for (const source of [detail, modal]) {
    assert.match(source, /setReplyTarget\(comment\)/);
    assert.match(source, /parentCommentId: replyTarget\?\.id \|\| null/);
    assert.match(source, /Replying to/);
  }
});

test("public follow profile supports server-owned follow and owner-filtered unfollow", async () => {
  const [page, service] = await Promise.all([
    readFile(new URL("src/pages/ProfilePage.jsx", root), "utf8"),
    readFile(new URL("src/services/supabase/follows.js", root), "utf8"),
  ]);
  assert.match(page, /getFollowStatus\(currentUser\.id, person\.id\)/);
  assert.match(page, /followUser\(person\.id\)/);
  assert.match(page, /unfollowUser\(currentUser\.id, person\.id\)/);
  assert.match(service, /insert\(\{ following_id: followingId \}\)/);
  assert.doesNotMatch(service, /insert\(\{[^}]*follower_id/s);
  assert.match(service, /eq\("follower_id", followerId\)[\s\S]*?eq\("following_id", followingId\)/);
});

test("direct Supabase Edge Function calls send both public apikey and the signed-in bearer token", async () => {
  const source = await readFile(new URL("src/services/pushNotifications.js", root), "utf8");
  assert.match(source, /apikey:\s*import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.ok(source.includes("Authorization: `Bearer ${session.access_token}`"));
  assert.match(source, /isTrustedPushEndpoint\(\)/);
});

test("environment template documents each public push setting once", async () => {
  const source = await readFile(new URL(".env.example", root), "utf8");
  assert.equal((source.match(/^VITE_WEB_PUSH_PUBLIC_KEY=/gm) || []).length, 1);
  assert.equal((source.match(/^VITE_PUSH_SUBSCRIPTION_ENDPOINT=/gm) || []).length, 1);
});

test("comment thread layout handles nested, orphaned, and cyclic relationships safely", () => {
  const comments = [
    { id: "root", parentCommentId: null },
    { id: "reply", parentCommentId: "root" },
    { id: "nested", parentCommentId: "reply" },
    { id: "orphan", parentCommentId: "deleted-parent" },
  ];
  assert.equal(getCommentDepth(comments[0], comments), 0);
  assert.equal(getCommentDepth(comments[1], comments), 1);
  assert.equal(getCommentDepth(comments[2], comments), 2);
  assert.equal(getCommentDepth(comments[3], comments), 0);
  const cycle = [
    { id: "left", parentCommentId: "right" },
    { id: "right", parentCommentId: "left" },
  ];
  assert.ok(getCommentDepth(cycle[0], cycle) <= 4);
});
