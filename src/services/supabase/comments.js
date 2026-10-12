import { supabase } from "./client";

export async function fetchCommentsFor(postId) {
  // Keep the reply query independent of embedded profile relationships. If
  // PostgREST's relationship cache is stale (PGRST200), reply text can still
  // load while author names are resolved separately below.
  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, author_id, text, created_at, parent_comment_id")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data) throw new Error("Replies unavailable");

  const authorIds = [...new Set(data.map((row) => row.author_id).filter(Boolean))];
  let usernamesById = new Map();

  if (authorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", authorIds);

    if (profilesError) {
      // Profile metadata is not required to preserve the reply itself.
      console.warn("Could not resolve reply author usernames:", profilesError);
    } else {
      usernamesById = new Map((profiles || []).map((profile) => [profile.id, profile.username || "unknown"]));
    }
  }

  return data.map((row) => ({
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    parentCommentId: row.parent_comment_id || null,
    authorUsername: usernamesById.get(row.author_id) || "unknown",
    text: row.text,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function addComment({ postId, authorId, text, parentCommentId = null }) {
  const commentDraft = { post_id: postId, author_id: authorId, text };
  if (parentCommentId) commentDraft.parent_comment_id = parentCommentId;

  const { data, error } = await supabase
    .from("comments")
    .insert(commentDraft)
    .select("id, post_id, author_id, text, created_at, parent_comment_id")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId) {
  if (!commentId) throw new Error("The comment could not be identified.");
  const { data, error } = await supabase.rpc("delete_my_comment", {
    p_comment_id: commentId,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Couldn't delete that comment. It may no longer be available.");
}
