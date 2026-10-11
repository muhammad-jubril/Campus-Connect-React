import { supabase } from "./client";

export const FEED_PAGE_SIZE = 20;

function postRowToPost(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    text: row.text,
    // Legacy video rows remain stored, but beta clients no longer render video media.
    media: row.media_type === "image" ? {
      type: "image",
      images: row.media_urls || [],
      count: (row.media_urls || []).length,
    } : null,
    createdAt: new Date(row.created_at).getTime(),
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : null,
    likes: Number(row.like_count) || 0,
    liked: !!row.liked_by_me,
    commentCount: Number(row.comment_count) || 0,
  };
}

// Author names are deliberately fetched from profiles in a separate query
// instead of a PostgREST embedded join. That keeps post retrieval independent
// of cached/discoverable foreign-key relationships (PGRST200). A profile lookup
// failure must not make the underlying post content disappear; the UI already
// supports a neutral "unknown" author fallback.
async function fetchUsernamesById(authorIds) {
  const ids = [...new Set((authorIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", ids);

  if (error) {
    console.warn("Could not resolve post author usernames:", error);
    return new Map();
  }

  return new Map((data || []).map((profile) => [profile.id, profile.username || "unknown"]));
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
    .select("id, author_id, text, media_type, media_urls, created_at, edited_at")
    .order("created_at", { ascending: false });

  if (authorId) query = query.eq("author_id", authorId);

  const { data: postRows, error } = await query;
  if (error) throw error;
  if (!postRows) throw new Error("Post data unavailable");

  const postIds = postRows.map((row) => row.id);
  const authorUsernamesPromise = fetchUsernamesById(postRows.map((row) => row.author_id));

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

    (likeResult.data || []).forEach((like) => {
      likeCounts[like.post_id] = (likeCounts[like.post_id] || 0) + 1;
      if (currentUserId && like.user_id === currentUserId) myLikes.add(like.post_id);
    });
    (commentResult.data || []).forEach((comment) => {
      commentCounts[comment.post_id] = (commentCounts[comment.post_id] || 0) + 1;
    });
  }

  const authorUsernames = await authorUsernamesPromise;

  return postRows.map((row) => postRowToPost({
    ...row,
    author_username: authorUsernames.get(row.author_id) || "unknown",
    like_count: likeCounts[row.id] || 0,
    liked_by_me: myLikes.has(row.id),
    comment_count: commentCounts[row.id] || 0,
  }));
}

export async function getPostById(postId, currentUserId) {
  const { data: row, error } = await supabase
    .from("posts")
    .select("id, author_id, text, media_type, media_urls, created_at, edited_at")
    .eq("id", postId)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;

  const [likesResult, commentsResult, likedResult, authorUsernames] = await Promise.all([
    supabase
      .from("likes")
      .select("user_id", { count: "exact", head: true })
      .eq("post_id", postId),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId),
    currentUserId
      ? supabase
          .from("likes")
          .select("post_id")
          .eq("post_id", postId)
          .eq("user_id", currentUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fetchUsernamesById([row.author_id]),
  ]);

  if (likesResult.error) throw likesResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (likedResult.error) throw likedResult.error;

  return postRowToPost({
    ...row,
    author_username: authorUsernames.get(row.author_id) || "unknown",
    like_count: likesResult.count || 0,
    liked_by_me: !!likedResult.data,
    comment_count: commentsResult.count || 0,
  });
}

export async function recordPostView(postId) {
  const { data, error } = await supabase.rpc("record_post_view", {
    p_post_id: postId,
  });

  if (error) throw error;

  if (data === null || data === undefined) {
    throw new Error("Post view count unavailable");
  }

  const count = Number(data);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error("Post view count unavailable");
  }

  return count;
}

export async function getPostsByAuthor(authorId, currentUserId) {
  return fetchPostsForQuery(currentUserId, authorId);
}

export async function createPost({ authorId, authorUsername, text, mediaType, mediaUrls }) {
  const safeText = typeof text === "string" ? text.trim() : "";
  const urls = Array.isArray(mediaUrls) ? mediaUrls : [];
  if (safeText.length > 500) throw new Error("Post text must be 500 characters or fewer.");
  if (!safeText && urls.length === 0) throw new Error("Write something or add at least one image to post.");
  if (mediaType === "video") throw new Error("Video uploads aren't supported in the beta.");
  if (mediaType !== null && mediaType !== "image") throw new Error("This post media type isn't supported.");
  if (urls.length > 4) throw new Error("A post can contain at most four images.");
  if (mediaType === "image" && urls.length === 0) throw new Error("Choose at least one image.");
  if (mediaType !== "image" && urls.length > 0) throw new Error("Post images need a valid media type.");
  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, text: safeText, media_type: mediaType, media_urls: urls })
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
  if (typeof text !== "string" || text.length > 500) throw new Error("Post text must be 500 characters or fewer.");
  const safeText = text.trim();
  const { error } = await supabase
    .from("posts")
    .update({ text: safeText })
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
