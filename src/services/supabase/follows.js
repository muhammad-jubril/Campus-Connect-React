import { supabase } from "./client";
import { normalizeFollowError } from "../../utils/followRelationshipErrors";

function throwFollowError(error) {
  if (error) throw normalizeFollowError(error);
}

/**
 * Relationship state is calculated by the authenticated RPC. No client-supplied
 * follower ID is sent; the backend derives identity from auth.uid().
 */
export async function getFollowStatus(profileId) {
  if (!profileId) throw new Error("The follow relationship could not be identified.");

  const { data, error } = await supabase.rpc("get_follow_counts", {
    p_profile_id: profileId,
  });
  throwFollowError(error);

  const summary = data?.[0];
  if (!summary) throw new Error("The profile's follow information is unavailable.");
  return Boolean(summary.is_following);
}

/** Returns true only when a new relationship was created by the backend. */
export async function followUser(followingId) {
  if (!followingId) throw new Error("The account to follow could not be identified.");

  const { data, error } = await supabase.rpc("follow_student", {
    p_following_id: followingId,
  });
  throwFollowError(error);
  return data === true;
}

/** Returns true only when the signed-in user's outgoing relationship was removed. */
export async function unfollowUser(followingId) {
  if (!followingId) throw new Error("The account to unfollow could not be identified.");

  const { data, error } = await supabase.rpc("unfollow_student", {
    p_following_id: followingId,
  });
  throwFollowError(error);
  return data === true;
}
