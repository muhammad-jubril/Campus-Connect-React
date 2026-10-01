import { supabase } from "./client";

export async function fetchCommentsFor(postId) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, text, created_at, profiles!comments_author_id_fkey(username)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    authorUsername: row.profiles ? row.profiles.username : "unknown",
    text: row.text,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function addComment({ postId, authorId, text }) {
  const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: authorId, text });
  if (error) throw error;
}
