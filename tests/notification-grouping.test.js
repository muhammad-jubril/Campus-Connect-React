import test from "node:test";
import assert from "node:assert/strict";
import {
  groupNotifications,
  notificationDestination,
  notificationSummary,
  normalizeNotificationType,
} from "../src/utils/notificationGrouping.js";

function row(id, type, createdAt, extra = {}) {
  const actorId = extra.actor_id || `actor-${id}`;
  return {
    id,
    type,
    recipient_id: "recipient",
    actor_id: actorId,
    actor: { id: actorId, name: extra.name || `Student ${id}`, username: `student${id}` },
    post_id: extra.post_id || null,
    comment_id: extra.comment_id || null,
    read: Boolean(extra.read),
    created_at: createdAt,
    ...extra,
  };
}

test("groups likes on one post without losing underlying activity IDs", () => {
  const rows = [
    row("l1", "like", "2026-10-12T10:00:00Z", { post_id: "post-a", actor_id: "u1", name: "Ibrahim" }),
    row("l2", "like", "2026-10-12T10:01:00Z", { post_id: "post-a", actor_id: "u2", name: "Amina" }),
    row("l3", "like", "2026-10-12T10:02:00Z", { post_id: "post-a", actor_id: "u3", name: "Musa", read: true }),
  ];
  const groups = groupNotifications(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
  assert.deepEqual(new Set(groups[0].items.map((item) => item.id)), new Set(["l1", "l2", "l3"]));
  assert.equal(groups[0].isUnread, true);
  assert.equal(notificationSummary(groups[0]), "Musa and 2 others liked your post.");
});

test("comments group by post while replies group by the specific comment/thread", () => {
  const groups = groupNotifications([
    row("c1", "comment", "2026-10-12T10:00:00Z", { post_id: "post-a" }),
    row("c2", "comment", "2026-10-12T10:01:00Z", { post_id: "post-a" }),
    row("r1", "reply", "2026-10-12T10:02:00Z", { post_id: "post-a", comment_id: "comment-1" }),
    row("r2", "reply", "2026-10-12T10:03:00Z", { post_id: "post-a", comment_id: "comment-2" }),
    row("r3", "reply", "2026-10-12T10:04:00Z", { post_id: "post-a", comment_id: "comment-1" }),
  ]);
  assert.equal(groups.find((group) => group.type === "comment").items.length, 2);
  const replyGroups = groups.filter((group) => group.type === "reply");
  assert.equal(replyGroups.length, 2);
  assert.equal(replyGroups.find((group) => group.commentId === "comment-1").items.length, 2);
});

test("recent follows group by UTC day, but unknown threads do not merge", () => {
  const groups = groupNotifications([
    row("f1", "follow", "2026-10-12T11:00:00Z"),
    row("f2", "new_follower", "2026-10-12T10:00:00Z"),
    row("f3", "follow", "2026-10-11T23:00:00Z"),
    row("r1", "reply", "2026-10-12T10:00:00Z", { post_id: "p" }),
    row("r2", "reply", "2026-10-12T10:01:00Z", { post_id: "p" }),
  ]);
  assert.equal(groups.filter((group) => group.type === "follow").length, 2);
  assert.equal(groups.find((group) => group.type === "follow" && group.items.some((item) => item.id === "f1")).items.length, 2);
  assert.equal(groups.filter((group) => group.type === "reply").length, 2);
});

test("normalizes expected backend type aliases and builds destination links", () => {
  assert.equal(normalizeNotificationType("post_like"), "like");
  assert.equal(normalizeNotificationType("comment_reply"), "reply");
  assert.equal(notificationDestination(row("l1", "like", "2026-10-12T10:00:00Z", { post_id: "post-a" })), "/post/post-a");
  assert.equal(notificationDestination(row("c1", "comment", "2026-10-12T10:00:00Z", { post_id: "post-a" })), "/post/post-a#comments");
  const follow = row("f1", "follow", "2026-10-12T10:00:00Z", { actor: { id: "u", username: "ada lovelace", name: "Ada" } });
  assert.equal(notificationDestination(follow), "/profile/ada%20lovelace");
});
