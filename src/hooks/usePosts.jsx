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
  const [activeCommentsPostId, setActiveCommentsPostId] = useState(null);
  const loadedRef = useRef(false);
  const loadedUserIdRef = useRef(null);
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
    loadedRef.current = false;
    loadedUserIdRef.current = null;
    setActiveCommentsPostId(null);
    commentsTriggerRef.current = null;
  }, [currentUserId]);

  const loadPosts = useCallback(async (force = false) => {
    const requestUserId = currentUserId;
    const requestEpoch = cacheEpochRef.current;
    if (loadedRef.current && loadedUserIdRef.current === requestUserId && !force) return true;

    setPostsError(null);

    let rows;
    try {
      rows = await postsApi.fetchPosts(requestUserId);
    } catch (error) {
      if (cacheEpochRef.current === requestEpoch && lastUserIdRef.current === requestUserId) {
        setPostsError(error);
        if (loadedUserIdRef.current !== requestUserId) loadedRef.current = false;
      }
      return false;
    }

    if (cacheEpochRef.current !== requestEpoch || lastUserIdRef.current !== requestUserId) return false;

    loadedRef.current = true;
    loadedUserIdRef.current = requestUserId;
    setPostsError(null);
    setPosts(rows);
    setPostsOwnerId(requestUserId);
    warmPeople(rows.map((p) => p.authorUsername));
    return true;
  }, [currentUserId, warmPeople]);

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
