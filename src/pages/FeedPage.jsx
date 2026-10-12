import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import PostCard from "../components/feed/PostCard";
import FeedSkeleton from "../components/common/Skeleton";
import MobileMenuButton from "../components/layout/MobileMenuButton";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import {
  getFeedScrollPosition,
  restoreFeedScrollPosition,
} from "../utils/feedScrollPosition.js";

export default function FeedPage() {
  const {
    posts,
    postsError,
    isFeedLoaded,
    loadPosts,
    loadMorePosts,
    hasMorePosts,
    loadingMorePosts,
    loadMoreError,
  } = usePosts();
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { openRightPanel } = useOutletContext() || {};
  const currentUserId = currentUser?.id || null;
  // A matching saved position proves this is the same feed history entry that
  // opened a post. Keep the cached list visible instead of briefly replacing it
  // with skeletons (which would clamp the nested scroll container to the top).
  const [loading, setLoading] = useState(() => !isFeedLoaded);
  const didRestoreScrollRef = useRef(false);

  function openChats() {
    if (window.matchMedia("(min-width: 768px)").matches && openRightPanel) {
      openRightPanel("chats");
      return;
    }
    navigate("/chats");
  }

  useEffect(() => {
    let active = true;

    async function loadFeed() {
      // loadPosts() already returns from the shared context cache when the feed
      // was loaded earlier. Avoid a loading-state flash for a saved feed entry.
      if (!isFeedLoaded) setLoading(true);
      await loadPosts();
      if (active) setLoading(false);
    }

    loadFeed();
    return () => { active = false; };
  }, [loadPosts]);

  useLayoutEffect(() => {
    if (didRestoreScrollRef.current || loading || postsError || !isFeedLoaded) return undefined;

    const savedPosition = getFeedScrollPosition(location.key, currentUserId);
    if (!savedPosition) {
      didRestoreScrollRef.current = true;
      return undefined;
    }

    // Wait until the cached feed DOM is committed, then restore both possible
    // scrolling surfaces: desktop's nested content container and mobile window.
    const frame = window.requestAnimationFrame(() => {
      restoreFeedScrollPosition(savedPosition);
      didRestoreScrollRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loading, posts.length, postsError, isFeedLoaded, location.key, currentUserId]);

  async function handleRetry() {
    setLoading(true);
    didRestoreScrollRef.current = true;
    await loadPosts(true);
    setLoading(false);
  }

  async function handleLoadMore() {
    await loadMorePosts();
  }

  return (
    <div className="feed-page">
      <div className="feed-sticky-controls">
        <div className="home-topbar">
          <MobileMenuButton />
          <div className="home-title-wrap">
            <h2 className="display">Campus Feed</h2>
          </div>
          <button type="button" className="icon-btn" onClick={openChats} aria-label="Chats">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </button>
        </div>

        <button type="button" className="home-search-bar" onClick={() => navigate("/search")} aria-label="Explore campus">
          <span className="home-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          </span>
          <span className="home-search-copy">Explore</span>
        </button>
      </div>

      <div className="home-welcome-card">
        <div className="home-welcome-copy">
          <span className="home-welcome-kicker">NWU • YOUR CAMPUS</span>
          <h3>What’s happening around you?</h3>
          <p>See what students are sharing, discover campus conversations, and add your own voice.</p>
        </div>
        <div className="home-welcome-orbit" aria-hidden="true"><span /><span /><span /></div>
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : postsError ? (
        <div className="empty-state" style={{ paddingTop: 48 }} role="alert">
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.6 2.8 17a2 2 0 0 0 1.75 3h14.9a2 2 0 0 0 1.75-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <span className="empty-state-tag">Feed unavailable</span>
          <p className="subtitle" style={{ marginBottom: 14, maxWidth: 280 }}>
            We couldn’t load the campus feed. Check your connection and try again.
          </p>
          <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={handleRetry}>
            Try again
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 48 }}>
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <span className="empty-state-tag">Nothing yet</span>
          <p className="subtitle" style={{ marginBottom: 14, maxWidth: 260 }}>Be the first to post something on campus.</p>
          <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={() => navigate("/create")}>Create a post</button>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}

      {!loading && !postsError && posts.length > 0 && (
        <div
          aria-live="polite"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 24px" }}
        >
          {loadMoreError && (
            <p
              className="subtitle"
              role="alert"
              style={{ color: "var(--accent-red)", textAlign: "center", fontSize: 12, marginBottom: 0 }}
            >
              We couldn’t load more posts. Check your connection and try again.
            </p>
          )}
          {hasMorePosts ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "auto", minWidth: 170, padding: "10px 20px" }}
              onClick={handleLoadMore}
              disabled={loadingMorePosts}
            >
              {loadingMorePosts ? "Loading more posts…" : loadMoreError ? "Try again" : "Load more posts"}
            </button>
          ) : (
            <p className="subtitle" style={{ fontSize: 11.5, marginBottom: 0 }}>
              You’re all caught up.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
