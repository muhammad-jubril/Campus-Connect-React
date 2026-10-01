import { supabase } from "./client";

function postRowToPost(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    text: row.text,
    media: !row.media_type ? null : {
      type: row.media_type,
      images: row.media_type === "image" ? (row.media_urls || []) : [],
      count: row.media_type === "image" ? (row.media_urls || []).length : 1,
      dataUrl: row.media_type === "video" ? (row.media_urls || [])[0] : undefined,
    },
    createdAt: new Date(row.created_at).getTime(),
    likes: row.like_count || 0,
    liked: !!row.liked_by_me,
    commentCount: row.comment_count || 0,
  };
}

export async function fetchPosts(currentUserId) {
  const { data: postRows, error } = await supabase
    .from("posts")
    .select("id, author_id, text, media_type, media_urls, created_at, profiles!posts_author_id_fkey(username)")
    .order("created_at", { ascending: false });
  if (error || !postRows) { console.warn("fetchPosts failed:", error); return []; }

  const postIds = postRows.map((r) => r.id);
  let likeCounts = {};
  let myLikes = new Set();
  let commentCounts = {};
  if (postIds.length > 0) {
    const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
      supabase.from("likes").select("post_id, user_id").in("post_id", postIds),
      supabase.from("comments").select("post_id").in("post_id", postIds),
    ]);
    (likeRows || []).forEach((l) => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (currentUserId && l.user_id === currentUserId) myLikes.add(l.post_id);
    });
    (commentRows || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });
  }

  return postRows.map((row) => postRowToPost({
    ...row,
    author_username: row.profiles ? row.profiles.username : "unknown",
    like_count: likeCounts[row.id] || 0,
    liked_by_me: myLikes.has(row.id),
    comment_count: commentCounts[row.id] || 0,
  }));
}

export async function createPost({ authorId, authorUsername, text, mediaType, mediaUrls }) {
  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, text, media_type: mediaType, media_urls: mediaUrls })
    .select()
    .single();
  if (error) throw error;

  return postRowToPost({
    ...inserted,
    author_username: authorUsername,
    like_count: 0,
    liked_by_me: false,
    comment_count: 0,
  });
}

export async function deletePost(postId) {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function likePost(postId, userId) {
  const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
  if (error) throw error;
}

export async function unlikePost(postId, userId) {
  const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
  if (error) throw error;
}

// Never for yourself liking/commenting on your own post — and RLS only
// lets you insert a notification where you're the actor anyway.
export async function notifyPostAuthor({ recipientId, actorId, type, postId }) {
  if (!recipientId || recipientId === actorId) return;
  await supabase.from("notifications").insert({ recipient_id: recipientId, actor_id: actorId, type, post_id: postId });
}
