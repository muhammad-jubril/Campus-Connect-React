import { supabase } from "./client";

export async function getFollowStatus(followerId, followingId) {
  if (!followerId || !followingId) throw new Error("The follow relationship could not be identified.");
  if (followerId === followingId) return false;

  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

/** The backend derives follower_id from auth.uid(); never send it in the insert. */
export async function followUser(followingId) {
  if (!followingId) throw new Error("The account to follow could not be identified.");
  const { error } = await supabase
    .from("follows")
    .insert({ following_id: followingId });

  // A concurrent click or retry may find the unique relationship already made.
  if (error?.code === "23505") return;
  if (error) throw error;
}

export async function unfollowUser(followerId, followingId) {
  if (!followerId || !followingId) throw new Error("The follow relationship could not be identified.");
  if (followerId === followingId) throw new Error("You cannot unfollow your own account.");

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);

  if (error) throw error;
}
