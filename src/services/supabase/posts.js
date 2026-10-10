import { supabase } from "./client";

export const FEED_PAGE_SIZE = 20;

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
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : null,
    likes: Number(row.like_count) || 0,
    liked: !!row.liked_by_me,
    commentCount: Number(row.comment_count) || 0,
  };
}

/**
 * Fetch one feed page through the database keyset-pagination RPC.
 * The cursor values are the raw timestamp and UUID returned by the RPC;
 * preserving them avoids precision loss from converting the timestamp to ms.
 */
export async function fetchFeedPage(cursor = null) {
  const { data: postRows, error } = await supabase.rpc("get_feed_posts", {
    p_limit: FEED_PAGE_SIZE,
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
  });

  if (error) throw error;
  if (!postRows) throw new Error("Feed data unavailable");

  const hasMore = postRows.length === FEED_PAGE_SIZE;
  const lastRow = postRows[postRows.length - 1];

  return {
    posts: postRows.map(postRowToPost),
    nextCursor: hasMore && lastRow
      ? { createdAt: lastRow.created_at, id: lastRow.id }
      : null,
    hasMore,
  };
}

async function fetchPostsForQuery(currentUserId, authorId = null) {
  let query = supabase
    .from("posts")
    .select("id, author_id, text, media_type, media_urls, created_at, edited_at, profiles!posts_author_id_fkey(username)")
    .order("created_at", { ascending: false });

  if (authorId) query = query.eq("author_id", authorId);

  const { data: postRows, error } = await query;
  if (error) throw error;
  if (!postRows) throw new Error("Post data unavailable");

  const postIds = postRows.map((r) => r.id);
  let likeCounts = {};
  let myLikes = new Set();
  let commentCounts = {};
  if (postIds.length > 0) {
    const [likeResult, commentResult] = await Promise.all([
      supabase.from("likes").select("post_id, user_id").in("post_id", postIds),
      supabase.from("comments").select("post_id").in("post_id", postIds),
    ]);

    if (likeResult.error) throw likeResult.error;
    if (commentResult.error) throw commentResult.error;

    (likeResult.data || []).forEach((l) => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (currentUserId && l.user_id === currentUserId) myLikes.add(l.post_id);
    });
    (commentResult.data || []).forEach((c) => {
      commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;
    });
  }

  return postRows.map((row) => postRowToPost({
    ...row,
    author_username: row.profiles ? row.profiles.username : "unknown",
    like_count: likeCounts[row.id] || 0,
    liked_by_me: myLikes.has(row.id),
    comment_count: commentCounts[row.id] || 0,
  }));
}

export async function getPostsByAuthor(authorId, currentUserId) {
  return fetchPostsForQuery(currentUserId, authorId);
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

export async function updatePostText(postId, text) {
  const { error } = await supabase
    .from("posts")
    .update({ text })
    .eq("id", postId);
  if (error) throw error;
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
