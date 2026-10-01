import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PostCard from "../components/feed/PostCard";
import FeedSkeleton from "../components/common/Skeleton";
import { usePosts } from "../hooks/usePosts";

export default function FeedPage() {
  const { posts, loadPosts } = usePosts();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPosts().then(() => setLoading(false));
  }, [loadPosts]);

  return (
    <div>
      <h2 className="display" style={{ marginBottom: 16 }}>Campus Feed</h2>
      {loading ? (
        <FeedSkeleton />
      ) : posts.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 64 }}>
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </div>
          <span className="empty-state-tag">Nothing yet</span>
          <p className="subtitle" style={{ marginBottom: 14, maxWidth: 260 }}>Be the first to post something on campus.</p>
          <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={() => navigate("/create")}>
            Create a post
          </button>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
