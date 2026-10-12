import { supabase } from "./client";
import { normalizeFollowError } from "../../utils/followRelationshipErrors";
import { followUser, unfollowUser } from "./follows";

const MAX_PAGE_SIZE = 100;

function throwFollowError(error) {
  if (error) throw normalizeFollowError(error);
}

async function ensureNoBlockBetweenViewerAndProfile(profileId, viewerId) {
  if (!profileId || !viewerId || profileId === viewerId) return;

  const { data, error } = await supabase.rpc("is_user_blocked", {
    p_other_user: profileId,
  });
  throwFollowError(error);

  if (data === true) {
    throw new Error("This list or follow action isn't available because a blocking restriction is in place.");
  }
}

/** Counts and relationship flags come from the authenticated, block-aware RPC. */
export async function getProfileFollowSummary(profileId, viewerId) {
  if (!profileId || !viewerId) throw new Error("Sign in to view follower information.");

  await ensureNoBlockBetweenViewerAndProfile(profileId, viewerId);

  const { data, error } = await supabase.rpc("get_follow_counts", {
    p_profile_id: profileId,
  });
  throwFollowError(error);

  const summary = data?.[0];
  if (!summary) throw new Error("The profile's follow information is unavailable.");

  return {
    followers: Number(summary.followers_count) || 0,
    following: Number(summary.following_count) || 0,
    isFollowing: Boolean(summary.is_following),
    isFollowedBy: Boolean(summary.is_followed_by),
  };
}

/** Compatibility wrapper; identity is derived from auth.uid() inside the RPC. */
export async function followStudent(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) {
    throw new Error("You can't follow this profile.");
  }
  await ensureNoBlockBetweenViewerAndProfile(targetId, viewerId);
  return followUser(targetId);
}

/** Compatibility wrapper; only the authenticated caller's outgoing edge is removed. */
export async function unfollowStudent(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) {
    throw new Error("You can't unfollow this profile.");
  }
  // Unfollow is intentionally allowed after a block so users can clean up
  // their outgoing edge; the RPC still limits the deletion to auth.uid().
  return unfollowUser(targetId);
}

/**
 * Fetch one page through the backend's block-aware list RPC. Counts come from
 * the matching count RPC; no relationship-table or client profile join is used.
 */
export async function getProfileConnectionPage(
  profileId,
  viewerId,
  connectionType,
  { offset = 0, limit = 30 } = {},
) {
  if (!profileId || !viewerId) throw new Error("Sign in to view this list.");
  if (!["followers", "following"].includes(connectionType)) {
    throw new Error("Choose either followers or following.");
  }

  await ensureNoBlockBetweenViewerAndProfile(profileId, viewerId);

  const safeOffset = Math.max(0, Math.min(1_000_000, Math.floor(Number(offset) || 0)));
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(limit) || 30)));
  const listRpc = connectionType === "followers" ? "get_followers" : "get_following";

  const [listResult, countResult] = await Promise.all([
    supabase.rpc(listRpc, {
      p_profile_id: profileId,
      p_limit: safeLimit,
      p_offset: safeOffset,
    }),
    supabase.rpc("get_follow_counts", { p_profile_id: profileId }),
  ]);

  throwFollowError(listResult.error);
  throwFollowError(countResult.error);

  const countSummary = countResult.data?.[0];
  if (!countSummary) throw new Error("The profile's follow information is unavailable.");

  const rows = listResult.data || [];
  const people = rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name || row.username || "Campus Connect student",
    avatarDataUrl: row.avatar_url || "",
    faculty: row.faculty || "",
    department: row.department || "",
    level: row.level || "",
    bio: row.bio || "",
    followedAt: row.followed_at || null,
    isFollowing: Boolean(row.is_following),
    isFollowedBy: Boolean(row.is_followed_by),
  }));

  const total = Number(connectionType === "followers"
    ? countSummary.followers_count
    : countSummary.following_count) || 0;
  const nextOffset = safeOffset + rows.length;

  return {
    people,
    count: total,
    nextOffset,
    hasMore: nextOffset < total && rows.length === safeLimit,
  };
}
