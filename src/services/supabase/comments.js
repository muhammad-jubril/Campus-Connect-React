import { supabase } from "./client";

export async function fetchCommentsFor(postId) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, author_id, text, created_at, profiles!comments_author_id_fkey(username)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data) throw new Error("Replies unavailable");

  return data.map((row) => ({
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    authorUsername: row.profiles ? row.profiles.username : "unknown",
    text: row.text,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function addComment({ postId, authorId, text }) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_id: authorId, text })
    .select("id, post_id, author_id, text, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}
