import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../common/Avatar";
import EditPostForm from "./EditPostForm";
import PostMenu from "./PostMenu";
import { usePeople } from "../../hooks/usePeople";
import { useAuth } from "../../hooks/useAuth";
import { usePosts } from "../../hooks/usePosts";
import { timeAgo } from "../../utils/timeAgo";

const placeholderMediaSvg = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
);

function MediaBlock({ media }) {
  if (!media) return null;
  if (media.type === "video") {
    return (
      <div className="post-card-media count-1">
        <div className="media-block is-video">
          {media.dataUrl
            ? <video src={media.dataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls muted playsInline />
            : <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
        </div>
      </div>
    );
  }
  const imgs = media.images || [];
  const count = Math.min(media.count || imgs.length || 1, 3);
  return (
    <div className={`post-card-media count-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div className="media-block" key={i}>
          {imgs[i] ? <img src={imgs[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : placeholderMediaSvg}
        </div>
      ))}
    </div>
  );
}

export default function PostCard({ post }) {
  const { getPerson } = usePeople();
  const { currentUser } = useAuth();
  const { toggleLike, openComments } = usePosts();
  const navigate = useNavigate();
  const [justLiked, setJustLiked] = useState(false);
  const [editing, setEditing] = useState(false);

  const author = getPerson(post.authorUsername);
  const isSelf = currentUser && post.authorId === currentUser.id;

  function handleLike() {
    if (!post.liked) {
      setJustLiked(true);
      setTimeout(() => setJustLiked(false), 550);
    }
    toggleLike(post.id);
  }

  return (
    <div className="post-card">
      <div className="post-card-head" onClick={() => navigate(`/profile/${post.authorUsername}`)}>
        <Avatar person={author} />
        <div>
          <div className="post-card-author">{author.name}{isSelf ? " (You)" : ""}</div>
          <div className="post-card-sub">{author.department || ""}{author.level ? ` · ${author.level} Level` : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <div className="post-card-time" style={{ marginLeft: 0 }}>
            {timeAgo(post.createdAt)}
            {post.editedAt && (
              <span style={{ marginLeft: 6, textTransform: "none" }}>(edited)</span>
            )}
          </div>
          {isSelf && <PostMenu post={post} onEdit={() => setEditing(true)} />}
        </div>
      </div>

      {editing ? (
        <EditPostForm
          post={post}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <div className="post-card-text">{post.text}</div>
      )}

      <MediaBlock media={post.media} />
      <div className="post-card-actions">
        <button type="button" className={`post-action-btn like-btn ${post.liked ? "liked" : ""} ${justLiked ? "stamp" : ""}`} onClick={handleLike}>
          <svg viewBox="0 0 24 24" fill={post.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6C3.2 5.9 5.4 4 7.9 4c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.5 0 4.5 1.9 4.5 4.6z" />
          </svg>
          <span className="like-count">{post.likes}</span>
          {justLiked && (
            <span className="like-burst">
              {Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ "--ang": `${i * 72}deg` }} />)}
            </span>
          )}
        </button>
        <button type="button" className="post-action-btn comment-btn" onClick={(event) => openComments(post.id, event.currentTarget)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span className="comment-count">{post.commentCount}</span>
        </button>
      </div>
    </div>
  );
}
