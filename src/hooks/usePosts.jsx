import { createContext, useCallback, useContext, useRef, useState } from "react";
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
  const [activeCommentsPostId, setActiveCommentsPostId] = useState(null);
  const loadedRef = useRef(false);
  const { currentUser } = useAuth();
  const { warmPeople } = usePeople();
  const { showToast } = useToast();

  const loadPosts = useCallback(async (force = false) => {
    if (loadedRef.current && !force) return;
    loadedRef.current = true;
    const rows = await postsApi.fetchPosts(currentUser && currentUser.id);
    setPosts(rows);
    warmPeople(rows.map((p) => p.authorUsername));
  }, [currentUser, warmPeople]);

  const addPost = useCallback((post) => {
    setPosts((prev) => [post, ...prev]);
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
      else {
        await postsApi.likePost(postId, currentUser.id);
        postsApi.notifyPostAuthor({
          recipientId: target.authorId, actorId: currentUser.id,
          actorUsername: currentUser.username, type: "like", postId,
        });
      }
    } catch (err) {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: wasLiked, likes: p.likes + (wasLiked ? 1 : -1) } : p));
      showToast("Couldn't update like — check your connection", "error");
    }
  }, [posts, currentUser, showToast]);

  const bumpCommentCount = useCallback((postId, delta) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, commentCount: p.commentCount + delta } : p));
  }, []);

  return (
    <PostsContext.Provider value={{
      posts, loadPosts, addPost, removePost, toggleLike, bumpCommentCount,
      activePost: posts.find((p) => p.id === activeCommentsPostId) || null,
      openComments: setActiveCommentsPostId,
      closeComments: () => setActiveCommentsPostId(null),
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
