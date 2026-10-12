import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("follow and unfollow mutate through authenticated RPCs, never direct table writes", async () => {
  const source = await read("src/services/supabase/follows.js");
  assert.match(source, /rpc\("follow_student",\s*\{\s*p_following_id: followingId/s);
  assert.match(source, /rpc\("unfollow_student",\s*\{\s*p_following_id: followingId/s);
  assert.match(source, /return data === true/g);
  assert.doesNotMatch(source, /\.from\(["']follows["']\)/);
  assert.doesNotMatch(source, /follower_id\s*:/);
});

test("profile summary uses the count RPC row and server-derived relationship flags", async () => {
  const source = await read("src/services/supabase/profileFollows.js");
  assert.match(source, /rpc\("get_follow_counts",\s*\{\s*p_profile_id: profileId/s);
  assert.match(source, /data\?\.\[0\]/);
  assert.match(source, /summary\.followers_count/);
  assert.match(source, /summary\.following_count/);
  assert.match(source, /summary\.is_following/);
  assert.match(source, /summary\.is_followed_by/);
});

test("connection lists use the paginated backend RPCs and do not join profile rows on the client", async () => {
  const source = await read("src/services/supabase/profileFollows.js");
  assert.match(source, /connectionType === "followers" \? "get_followers" : "get_following"/);
  assert.match(source, /p_limit: safeLimit/);
  assert.match(source, /p_offset: safeOffset/);
  assert.match(source, /followedAt: row\.followed_at/);
  assert.doesNotMatch(source, /\.from\(["']profiles["']\)/);
  assert.doesNotMatch(source, /\.from\(["']follows["']\)/);
});

test("profile follow button consumes idempotent mutation results and reloads authoritative counts", async () => {
  const source = await read("src/pages/ProfilePage.jsx");
  assert.match(source, /const changed = await unfollowUser\(person\.id\)/);
  assert.match(source, /const changed = await followUser\(person\.id\)/);
  assert.match(source, /setFollowRetryKey\(\(key\) => key \+ 1\)/);
});
