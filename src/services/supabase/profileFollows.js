import { supabase } from "./client";
import { normalizeFollowError } from "../../utils/followRelationshipErrors";

const FOLLOW_TABLE = "follows";
const PROFILE_COLUMNS = "id,username,name,avatar_url,faculty,department,level,bio";
const MAX_PAGE_SIZE = 50;

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

/**
 * Loads real totals and the viewer's relationship with the profile. This expects
 * the backend contract documented in PROFILE-FOLLOWING-BACKEND-CONTRACT.md.
 * A missing table is surfaced as an error, never interpreted as zero follows.
 */
export async function getProfileFollowSummary(profileId, viewerId) {
  if (!profileId || !viewerId) throw new Error("Sign in to view follower information.");

  await ensureNoBlockBetweenViewerAndProfile(profileId, viewerId);

  const followersQuery = supabase
    .from(FOLLOW_TABLE)
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", profileId);

  const followingQuery = supabase
    .from(FOLLOW_TABLE)
    .select("following_id", { count: "exact", head: true })
    .eq("follower_id", profileId);

  const relationshipQuery = profileId === viewerId
    ? Promise.resolve({ data: null, error: null })
    : supabase
      .from(FOLLOW_TABLE)
      .select("following_id")
      .eq("follower_id", viewerId)
      .eq("following_id", profileId)
      .maybeSingle();

  const [followersResult, followingResult, relationshipResult] = await Promise.all([
    followersQuery,
    followingQuery,
    relationshipQuery,
  ]);

  throwFollowError(followersResult.error);
  throwFollowError(followingResult.error);
  throwFollowError(relationshipResult.error);

  return {
    followers: Number(followersResult.count) || 0,
    following: Number(followingResult.count) || 0,
    isFollowing: Boolean(relationshipResult.data),
  };
}

/** Follow insertion is protected by the server's unique pair constraint and RLS. */
export async function followStudent(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) {
    throw new Error("You can't follow this profile.");
  }

  await ensureNoBlockBetweenViewerAndProfile(targetId, viewerId);

  const { error } = await supabase.from(FOLLOW_TABLE).insert({
    follower_id: viewerId,
    following_id: targetId,
  });

  // A race can happen if another tab already completed the same follow. The
  // unique pair is authoritative; duplicate insertion is an idempotent success.
  if (error?.code === "23505") return;
  throwFollowError(error);
}

export async function unfollowStudent(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) {
    throw new Error("You can't unfollow this profile.");
  }

  await ensureNoBlockBetweenViewerAndProfile(targetId, viewerId);

  const { error } = await supabase
    .from(FOLLOW_TABLE)
    .delete()
    .eq("follower_id", viewerId)
    .eq("following_id", targetId);

  throwFollowError(error);
}

/**
 * Fetch one page of real follow relationships, then load visible profile cards.
 * Profiles are read separately to avoid relying on an unverified embedded join.
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

  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(limit) || 30)));
  const relationColumn = connectionType === "followers" ? "following_id" : "follower_id";
  const profileIdColumn = connectionType === "followers" ? "follower_id" : "following_id";

  const { data: relationships, error, count } = await supabase
    .from(FOLLOW_TABLE)
    .select("follower_id,following_id,created_at", { count: "exact" })
    .eq(relationColumn, profileId)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  throwFollowError(error);

  const rows = relationships || [];
  const profileIds = rows.map((row) => row[profileIdColumn]).filter(Boolean);

  if (!profileIds.length) {
    const total = Number(count) || 0;
    const nextOffset = safeOffset + rows.length;
    return {
      people: [],
      count: total,
      nextOffset,
      hasMore: count == null ? rows.length === safeLimit : nextOffset < total,
    };
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", [...new Set(profileIds)]);

  throwFollowError(profileError);
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const people = profileIds
    .map((id) => profilesById.get(id))
    .filter(Boolean)
    .map((profile) => ({
      id: profile.id,
      username: profile.username,
      name: profile.name || profile.username || "Campus Connect student",
      avatarDataUrl: profile.avatar_url || "",
      faculty: profile.faculty || "",
      department: profile.department || "",
      level: profile.level || "",
      bio: profile.bio || "",
    }));

  const nextOffset = safeOffset + rows.length;
  const total = Number(count) || 0;

  return {
    people,
    count: total,
    nextOffset,
    hasMore: count == null ? rows.length === safeLimit : nextOffset < total,
  };
}
