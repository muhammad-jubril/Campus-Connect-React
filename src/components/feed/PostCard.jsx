import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Avatar from "../common/Avatar";
import EditPostForm from "./EditPostForm";
import ImageViewer from "./ImageViewer";
import PostMenu from "./PostMenu";
import { usePeople } from "../../hooks/usePeople";
import { useAuth } from "../../hooks/useAuth";
import { usePosts } from "../../hooks/usePosts";
import { useToast } from "../../hooks/useToast";
import { timeAgo } from "../../utils/timeAgo";
import {
  captureCurrentScrollPosition,
  saveFeedScrollPosition,
} from "../../utils/feedScrollPosition.js";

function MediaBlock({ media, onPreview, authorName }) {
  if (!media) return null;

  // Keep media from older video posts renderable, but don't expose a new video
  // upload path in the beta composer or createPost service.
  if (media.type === "video") {
    const videoUrl = media.url || media.dataUrl || media.images?.[0];
    if (!videoUrl) return null;
    return (
      <div className="post-card-media count-1">
        <div className="media-block is-video">
          <video
            src={videoUrl}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            controls
            preload="metadata"
            playsInline
            aria-label={`Video post by ${authorName}`}
          />
        </div>
      </div>
    );
  }

  const images = Array.isArray(media.images) ? media.images.slice(0, 4) : [];
  if (images.length === 0) return null;

  return (
    <div className={`post-card-media count-${images.length}`}>
      {images.map((src, index) => (
        <button
          type="button"
          className="media-block media-block-clickable"
          key={`${src}-${index}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPreview(src, index, event.currentTarget);
          }}
          aria-label={`View image ${index + 1} of ${images.length} from ${authorName}'s post`}
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </button>
      ))}
    </div>
  );
}

export default function PostCard({
  post,
  openOnClick = true,
  showPostMenu = true,
  onLike,
  onOpenComments,
}) {
  const { getPerson } = usePeople();
  const { currentUser } = useAuth();
  const { toggleLike } = usePosts();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [justLiked, setJustLiked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);

  const author = getPerson(post.authorUsername);
  const isSelf = currentUser && post.authorId === currentUser.id;

  function navigateToPost(hash = "") {
    // Save only when the user opens a detail page from the Campus Feed. The
    // history key lets restoration target this exact feed entry and user.
    if (location.pathname === "/feed") {
      saveFeedScrollPosition(
        location.key,
        currentUser?.id || null,
        captureCurrentScrollPosition(),
      );
    }
    navigate(`/post/${post.id}${hash}`, { state: { post } });
  }

  const openPost = openOnClick ? () => navigateToPost() : undefined;
  const closeImageViewer = useCallback(() => setImageViewer(null), []);

  function handlePreview(src, index, triggerElement) {
    setImageViewer({
      src,
      alt: `Image ${index + 1} from ${author.name || "a student's"} post`,
      triggerElement,
    });
  }

  function handleLike() {
    if (!post.liked) {
      setJustLiked(true);
      window.setTimeout(() => setJustLiked(false), 550);
    }

    if (onLike) onLike();
    else toggleLike(post.id);
  }

  async function handleShare() {
    const url = `${window.location.origin}/post/${encodeURIComponent(post.id)}`;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Campus Connect post",
          text: post.text?.trim() || `A post by @${post.authorUsername} on Campus Connect`,
          url,
        });
        return;
      }

      if (!navigator.clipboard?.writeText) {
        showToast("Sharing isn't available in this browser", "error");
        return;
      }

      await navigator.clipboard.writeText(url);
      showToast("Post link copied to clipboard");
    } catch (error) {
      if (error?.name !== "AbortError") {
        showToast("Couldn't share this post — try copying its link", "error");
      }
    }
  }

  function handleCardClick(event) {
    if (!openPost || editing) return;
    if (event.target.closest("button, a, input, textarea, select, video, audio, [role='menu'], .post-card-head, .post-card-media")) return;
    openPost();
  }

  function handleOpenComments(event) {
    event.stopPropagation();
    if (onOpenComments) {
      onOpenComments(event.currentTarget);
      return;
    }
    navigateToPost("#comments");
  }

  return (
    <>
      <article className="post-card" onClick={handleCardClick}>
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
            {showPostMenu && <PostMenu post={post} onEdit={() => setEditing(true)} />}
          </div>
        </div>

        {editing ? (
          <EditPostForm
            post={post}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <>
            {post.text && (
              openPost ? (
                <button type="button" className="post-card-open-text" onClick={openPost} aria-label={`Open post by ${author.name}`}>
                  <span className="post-card-text">{post.text}</span>
                </button>
              ) : (
                <div className="post-card-text">{post.text}</div>
              )
            )}
            <MediaBlock media={post.media} onPreview={handlePreview} authorName={author.name || "student"} />
          </>
        )}

        <div className="post-card-actions">
          <button type="button" className={`post-action-btn like-btn ${post.liked ? "liked" : ""} ${justLiked ? "stamp" : ""}`} onClick={handleLike} aria-label={post.liked ? "Unlike post" : "Like post"}>
            <svg viewBox="0 0 24 24" fill={post.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6C3.2 5.9 5.4 4 7.9 4c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.5 0 4.5 1.9 4.5 4.6z" />
            </svg>
            <span className="like-count">{post.likes}</span>
            {justLiked && (
              <span className="like-burst" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ "--ang": `${i * 72}deg` }} />)}
              </span>
            )}
          </button>
          <button type="button" className="post-action-btn comment-btn" onClick={handleOpenComments} aria-label={`View ${post.commentCount} replies`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span className="comment-count">{post.commentCount}</span>
          </button>
          <button type="button" className="post-action-btn share-btn" onClick={handleShare} aria-label="Share post">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.6 6.6-4.2M8.7 13.4l6.6 4.2" /></svg>
            <span>Share</span>
          </button>
        </div>
      </article>
      {imageViewer && (
        <ImageViewer
          src={imageViewer.src}
          alt={imageViewer.alt}
          triggerElement={imageViewer.triggerElement}
          onClose={closeImageViewer}
        />
      )}
    </>
  );
}
