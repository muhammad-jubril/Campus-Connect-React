import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PostCard from "../components/feed/PostCard";
import FeedSkeleton from "../components/common/Skeleton";
import MobileMenuButton from "../components/layout/MobileMenuButton";
import { usePosts } from "../hooks/usePosts";

export default function FeedPage() {
  const { posts, loadPosts } = usePosts();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPosts().then(() => setLoading(false));
  }, [loadPosts]);

  return (
    <div className="feed-page">
      <div className="home-topbar">
        <MobileMenuButton />
        <div className="home-title-wrap">
          <h2 className="display">Campus Feed</h2>
        </div>
        <button type="button" className="icon-btn" onClick={() => navigate("/chats")} aria-label="Chats">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      </div>

      <button type="button" className="home-search-bar" onClick={() => navigate("/search")} aria-label="Search students">
        <span className="home-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        </span>
        <span className="home-search-copy">Search students</span>
      </button>

      <div className="home-welcome-card">
        <div className="home-welcome-copy">
          <span className="home-welcome-kicker">NWU • YOUR CAMPUS</span>
          <h3>What’s happening around you?</h3>
          <p>See what students are sharing, discover campus conversations, and add your own voice.</p>
        </div>
        <div className="home-welcome-orbit" aria-hidden="true"><span /><span /><span /></div>
      </div>

      <div className="campus-pulse-strip" aria-label="Campus pulse">
        <div><span>ACTIVE</span><strong>2,340</strong></div>
        <i />
        <div><span>POSTS TODAY</span><strong>186</strong></div>
        <i />
        <div><span>THIS WEEK</span><strong>412</strong></div>
      </div>

      {loading ? (
        <FeedSkeleton />
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
    </div>
  );
}
