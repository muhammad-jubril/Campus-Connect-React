import { supabase } from "./client";
import { removeUploadedFile } from "./storage";
import { validatePostPayload } from "../../utils/postRules";

export const FEED_PAGE_SIZE = 20;

function postRowToPost(row) {
  let media = null;
  if (row.media_type === "image") {
    media = {
      type: "image",
      images: row.media_urls || [],
      count: (row.media_urls || []).length,
    };
  } else if (row.media_type === "video") {
    // Legacy video URLs remain renderable, although new video posts are blocked.
    const videoUrl = (row.media_urls || [])[0] || null;
    media = { type: "video", url: videoUrl, dataUrl: videoUrl, images: [], count: 1 };
  }

  return {
    id: row.id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    text: row.text,
    media,
    createdAt: new Date(row.created_at).getTime(),
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : null,
    likes: Number(row.like_count) || 0,
    liked: !!row.liked_by_me,
    commentCount: Number(row.comment_count) || 0,
    viewCount: row.view_count === null || row.view_count === undefined
      ? null
      : Math.max(0, Number(row.view_count) || 0),
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

// The raw post_views table intentionally denies client reads. Fetch aggregate
// counts through the bounded SECURITY DEFINER RPC instead, in chunks so profile
// pages with many posts never exceed its input limit.
async function fetchPostViewCounts(postIds) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const counts = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase.rpc("get_post_view_counts", {
      p_post_ids: ids.slice(index, index + 100),
    });

    if (error) {
      // A missing/not-yet-deployed view-count migration must not take down the feed.
      console.warn("Post view counts are temporarily unavailable:", error);
      return null;
    }

    (data || []).forEach((row) => {
      const count = Number(row.view_count);
      if (row.post_id && Number.isFinite(count) && count >= 0) counts.set(row.post_id, count);
    });
  }

  return counts;
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
  const viewCounts = await fetchPostViewCounts(postRows.map((row) => row.id));

  return {
    posts: postRows.map((row) => postRowToPost({
      ...row,
      view_count: viewCounts?.get(row.id) ?? null,
    })),
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
  const viewCountsPromise = fetchPostViewCounts(postIds);

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

  const [authorUsernames, viewCounts] = await Promise.all([
    authorUsernamesPromise,
    viewCountsPromise,
  ]);

  return postRows.map((row) => postRowToPost({
    ...row,
    author_username: authorUsernames.get(row.author_id) || "unknown",
    like_count: likeCounts[row.id] || 0,
    liked_by_me: myLikes.has(row.id),
    comment_count: commentCounts[row.id] || 0,
    view_count: viewCounts?.get(row.id) ?? null,
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

  const [likesResult, commentsResult, likedResult, authorUsernames, viewCounts] = await Promise.all([
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
    fetchPostViewCounts([postId]),
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
    view_count: viewCounts?.get(postId) ?? null,
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
  const {
    text: safeText,
    mediaType: safeMediaType,
    mediaUrls: urls,
  } = validatePostPayload({ text, mediaType, mediaUrls });

  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({ author_id: authorId, text: safeText, media_type: safeMediaType, media_urls: urls })
    .select()
    .single();
  if (error) throw error;

  return postRowToPost({
    ...inserted,
    author_username: authorUsername,
    like_count: 0,
    liked_by_me: false,
    comment_count: 0,
    view_count: 0,
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
  const { data: existingPost, error: lookupError } = await supabase
    .from("posts")
    .select("author_id, media_type, media_urls")
    .eq("id", postId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existingPost) throw new Error("Post not found.");

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;

  if (existingPost.media_type === "image" && Array.isArray(existingPost.media_urls)) {
    const cleanupResults = await Promise.allSettled(
      existingPost.media_urls.map((url) => removeUploadedFile("post-media", url)),
    );
    if (cleanupResults.some((result) => result.status === "rejected")) {
      // The database deletion has succeeded. A storage cleanup failure should
      // not misreport the delete as failed; log it for follow-up instead.
      console.warn("Post deleted, but one or more media objects could not be removed.");
    }
  }
}

export async function likePost(postId, userId) {
  const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
  if (error) throw error;
}

export async function unlikePost(postId, userId) {
  const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
  if (error) throw error;
}
