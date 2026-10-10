import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as postsApi from "../services/supabase/posts";
import { useAuth } from "./useAuth";
import { usePeople } from "./usePeople";
import { useToast } from "./useToast";

const PostsContext = createContext(null);

// Posts live in one shared context (not per-page state) because the same
// post can appear in the feed AND on a profile page — liking it in one
// place needs to be reflected in the other without a re-fetch.
export function PostsProvider({ children }) {
  const [posts, setPosts] = useState([]);
  const [postsOwnerId, setPostsOwnerId] = useState(null);
  const [postsError, setPostsError] = useState(null);
  const [feedCursor, setFeedCursor] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState(null);
  const loadedRef = useRef(false);
  const loadedUserIdRef = useRef(null);
  const loadedScopeRef = useRef(null);
  const loadRequestRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);
  const cacheEpochRef = useRef(0);
  const lastUserIdRef = useRef(null);
  const commentsTriggerRef = useRef(null);
  const { currentUser } = useAuth();
  const { warmPeople } = usePeople();
  const { showToast } = useToast();
  const currentUserId = currentUser?.id || null;

  if (lastUserIdRef.current !== currentUserId) {
    lastUserIdRef.current = currentUserId;
    cacheEpochRef.current += 1;
  }

  useEffect(() => {
    if (loadedUserIdRef.current === currentUserId) return;

    setPosts([]);
    setPostsOwnerId(null);
    setPostsError(null);
    setFeedCursor(null);
    setHasMorePosts(false);
    setLoadingMorePosts(false);
    setLoadMoreError(null);
    loadMoreInFlightRef.current = false;
    loadedRef.current = false;
    loadedUserIdRef.current = null;
    loadedScopeRef.current = null;
    setActiveCommentsPostId(null);
    commentsTriggerRef.current = null;
  }, [currentUserId]);

  const commitLoadedPosts = useCallback((rows, scope, requestUserId) => {
    loadedRef.current = true;
    loadedUserIdRef.current = requestUserId;
    loadedScopeRef.current = scope;
    setPostsError(null);
    setLoadMoreError(null);
    setPosts(rows);
    setPostsOwnerId(requestUserId);
    warmPeople(rows.map((p) => p.authorUsername));
  }, [warmPeople]);

  const loadPosts = useCallback(async (force = false) => {
    const requestUserId = currentUserId;
    const requestEpoch = cacheEpochRef.current;
    const scope = "feed";
    if (loadedRef.current && loadedUserIdRef.current === requestUserId && loadedScopeRef.current === scope && !force) return true;

    const requestId = ++loadRequestRef.current;
    loadMoreInFlightRef.current = false;
    setLoadingMorePosts(false);
    setLoadMoreError(null);
    setFeedCursor(null);
    setHasMorePosts(false);
    setPostsError(null);
    setPosts([]);
    setPostsOwnerId(requestUserId);

    let page;
    try {
      page = await postsApi.fetchFeedPage(null);
    } catch (error) {
      if (
        requestId === loadRequestRef.current &&
        cacheEpochRef.current === requestEpoch &&
        lastUserIdRef.current === requestUserId
      ) {
        setPostsError(error);
        loadedRef.current = false;
        loadedScopeRef.current = null;
      }
      return false;
    }

    if (
      requestId !== loadRequestRef.current ||
      cacheEpochRef.current !== requestEpoch ||
      lastUserIdRef.current !== requestUserId
    ) return false;

    commitLoadedPosts(page.posts, scope, requestUserId);
    setFeedCursor(page.nextCursor);
    setHasMorePosts(page.hasMore);
    return true;
  }, [commitLoadedPosts, currentUserId]);

  const loadPostsByAuthor = useCallback(async (authorId, force = false) => {
    const requestUserId = currentUserId;
    const requestEpoch = cacheEpochRef.current;
    const scope = `author:${authorId}`;
    if (!authorId) return false;
    if (loadedRef.current && loadedUserIdRef.current === requestUserId && loadedScopeRef.current === scope && !force) return true;

    const requestId = ++loadRequestRef.current;
    loadMoreInFlightRef.current = false;
    setLoadingMorePosts(false);
    setLoadMoreError(null);
    setFeedCursor(null);
    setHasMorePosts(false);
    setPostsError(null);
    setPosts([]);
    setPostsOwnerId(requestUserId);

    let rows;
    try {
      rows = await postsApi.getPostsByAuthor(authorId, requestUserId);
    } catch (error) {
      if (
        requestId === loadRequestRef.current &&
        cacheEpochRef.current === requestEpoch &&
        lastUserIdRef.current === requestUserId
      ) {
        setPostsError(error);
        loadedRef.current = false;
        loadedScopeRef.current = null;
      }
      return false;
    }

    if (
      requestId !== loadRequestRef.current ||
      cacheEpochRef.current !== requestEpoch ||
      lastUserIdRef.current !== requestUserId
    ) return false;

    commitLoadedPosts(rows, scope, requestUserId);
    return true;
  }, [commitLoadedPosts, currentUserId]);

  const loadMorePosts = useCallback(async () => {
    const requestUserId = currentUserId;
    const requestEpoch = cacheEpochRef.current;
    const requestId = loadRequestRef.current;

    if (
      !hasMorePosts ||
      !feedCursor ||
      loadMoreInFlightRef.current ||
      loadedScopeRef.current !== "feed" ||
      loadedUserIdRef.current !== requestUserId
    ) return false;

    loadMoreInFlightRef.current = true;
    setLoadingMorePosts(true);
    setLoadMoreError(null);

    try {
      const page = await postsApi.fetchFeedPage(feedCursor);
      if (
        requestId !== loadRequestRef.current ||
        cacheEpochRef.current !== requestEpoch ||
        lastUserIdRef.current !== requestUserId ||
        loadedScopeRef.current !== "feed" ||
        loadedUserIdRef.current !== requestUserId
      ) return false;

      setPosts((previous) => {
        const existingIds = new Set(previous.map((post) => post.id));
        const additionalPosts = page.posts.filter((post) => !existingIds.has(post.id));
        return [...previous, ...additionalPosts];
      });
      setFeedCursor(page.nextCursor);
      setHasMorePosts(page.hasMore);
      setLoadMoreError(null);
      warmPeople(page.posts.map((post) => post.authorUsername));
      return true;
    } catch (error) {
      if (
        requestId === loadRequestRef.current &&
        cacheEpochRef.current === requestEpoch &&
        lastUserIdRef.current === requestUserId &&
        loadedScopeRef.current === "feed"
      ) {
        setLoadMoreError(error);
      }
      return false;
    } finally {
      if (
        requestId === loadRequestRef.current &&
        cacheEpochRef.current === requestEpoch &&
        lastUserIdRef.current === requestUserId
      ) {
        loadMoreInFlightRef.current = false;
        setLoadingMorePosts(false);
      }
    }
  }, [currentUserId, feedCursor, hasMorePosts, warmPeople]);

  const addPost = useCallback((post) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  const updatePostText = useCallback(async (postId, text) => {
    await postsApi.updatePostText(postId, text);
    setPosts((prev) => prev.map((p) => (
      p.id === postId ? { ...p, text, editedAt: Date.now() } : p
    )));
  }, []);

  const removePost = useCallback(async (postId) => {
    await postsApi.deletePost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const toggleLike = useCallback(async (postId) => {
    if (!currentUser) return;
    const target = posts.find((p) => p.id === postId);
    if (!target) return;
    const wasLiked = target.liked;

    // Optimistic update, reverted on failure — a dropped connection
    // shouldn't leave the button showing something that didn't happen.
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: !wasLiked, likes: p.likes + (wasLiked ? -1 : 1) } : p));

    try {
      if (wasLiked) await postsApi.unlikePost(postId, currentUser.id);
      else await postsApi.likePost(postId, currentUser.id);
    } catch (err) {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: wasLiked, likes: p.likes + (wasLiked ? 1 : -1) } : p));
      showToast("Couldn't update like — check your connection", "error");
    }
  }, [posts, currentUser, showToast]);

  const bumpCommentCount = useCallback((postId, delta) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? {
      ...p,
      commentCount: Math.max(0, (p.commentCount || 0) + delta),
    } : p));
  }, []);

  const openComments = useCallback((postId, trigger = null) => {
    commentsTriggerRef.current = trigger;
    setActiveCommentsPostId(postId);
  }, []);

  const closeComments = useCallback(() => {
    const trigger = commentsTriggerRef.current;
    commentsTriggerRef.current = null;
    setActiveCommentsPostId(null);
    if (trigger && trigger.isConnected) {
      window.setTimeout(() => trigger.focus(), 0);
    }
  }, []);

  const visiblePosts = postsOwnerId === currentUserId ? posts : [];

  return (
    <PostsContext.Provider value={{
      posts: visiblePosts,
      postsError,
      loadPosts,
      loadPostsByAuthor,
      loadMorePosts,
      hasMorePosts,
      loadingMorePosts,
      loadMoreError,
      addPost,
      updatePostText,
      removePost,
      toggleLike,
      bumpCommentCount,
      activePost: visiblePosts.find((p) => p.id === activeCommentsPostId) || null,
      openComments,
      closeComments,
    }}>
      {children}
    </PostsContext.Provider>
  );
}

export function usePosts() {
  const ctx = useContext(PostsContext);
  if (!ctx) throw new Error("usePosts must be used inside <PostsProvider>");
  return ctx;
}
