import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import PostCard from "../components/feed/PostCard";
import { useAuth } from "../hooks/useAuth";
import { usePeople } from "../hooks/usePeople";
import { usePosts } from "../hooks/usePosts";
import { useToast } from "../hooks/useToast";
import {
  getPostById,
  likePost,
  recordPostView,
  unlikePost,
} from "../services/supabase/posts";
import {
  addComment,
  deleteComment,
  fetchCommentsFor,
} from "../services/supabase/comments";
import { timeAgo } from "../utils/timeAgo";

const MAX_COMMENT_LENGTH = 500;

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z" />
  </svg>
);

export default function PostDetailPage() {
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { getPerson, warmPeople } = usePeople();
  const {
    posts,
    syncPost,
    toggleLike,
    bumpCommentCount,
  } = usePosts();
  const { showToast } = useToast();

  const [post, setPost] = useState(null);
  const [postLoading, setPostLoading] = useState(true);
  const [postError, setPostError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [viewCount, setViewCount] = useState(null);
  const [viewsUnavailable, setViewsUnavailable] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentsError, setCommentsError] = useState(false);
  const [commentsReloadKey, setCommentsReloadKey] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const commentSectionRef = useRef(null);
  const commentInputRef = useRef(null);

  const postFromContext = posts.find((item) => item.id === postId) || null;
  const cachedNavigationPost = location.state?.post?.id === postId ? location.state.post : null;
  const visiblePost = postFromContext || post;

  useEffect(() => {
    let active = true;

    async function loadPost() {
      setPostLoading(true);
      setPostError(false);
      setNotFound(false);
      setPost(cachedNavigationPost);
      setViewCount(null);
      setViewsUnavailable(false);

      try {
        const fetchedPost = await getPostById(postId, currentUser?.id || null);
        if (!active) return;

        if (!fetchedPost) {
          setNotFound(true);
          return;
        }

        setPost(fetchedPost);
        syncPost(fetchedPost);
        warmPeople([fetchedPost.authorUsername]);

        // View tracking is deliberately non-blocking: if the migration has not
        // been applied yet, the post and its replies still remain usable.
        recordPostView(postId)
          .then((count) => {
            if (active) setViewCount(count);
          })
          .catch((error) => {
            console.error("Record post view failed:", error);
            if (active) setViewsUnavailable(true);
          });
      } catch (error) {
        console.error("Load post detail failed:", error);
        if (active && cachedNavigationPost) {
          setPost(cachedNavigationPost);
          setViewsUnavailable(true);
          warmPeople([cachedNavigationPost.authorUsername]);
        } else if (active) {
          setPostError(true);
        }
      } finally {
        if (active) setPostLoading(false);
      }
    }

    if (!postId) {
      setPostLoading(false);
      setNotFound(true);
      return () => { active = false; };
    }

    loadPost();
    return () => { active = false; };
  }, [postId, currentUser?.id, warmPeople, syncPost, cachedNavigationPost]);

  useEffect(() => {
    let active = true;
    setComments(null);
    setCommentsError(false);

    fetchCommentsFor(postId)
      .then((rows) => {
        if (!active) return;
        setComments(rows);
        warmPeople(rows.map((comment) => comment.authorUsername));
      })
      .catch((error) => {
        console.error("Load post replies failed:", error);
        if (active) setCommentsError(true);
      });

    return () => { active = false; };
  }, [postId, commentsReloadKey, warmPeople]);

  useEffect(() => {
    if (location.hash !== "#comments" || comments === null) return undefined;
    const frame = window.requestAnimationFrame(() => {
      commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      commentInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, comments]);

  function handleBack() {
    if (location.key === "default") navigate("/feed");
    else navigate(-1);
  }

  async function handleLike() {
    if (!currentUser || !visiblePost) return;

    // Keep the shared feed/profile cache in sync when this post is already
    // present there. A directly opened post uses local optimistic state.
    if (postFromContext) {
      toggleLike(postId);
      return;
    }

    const wasLiked = visiblePost.liked;
    setPost((previous) => previous ? {
      ...previous,
      liked: !wasLiked,
      likes: Math.max(0, previous.likes + (wasLiked ? -1 : 1)),
    } : previous);

    try {
      if (wasLiked) await unlikePost(postId, currentUser.id);
      else await likePost(postId, currentUser.id);
    } catch (error) {
      console.error("Update post like failed:", error);
      setPost((previous) => previous ? {
        ...previous,
        liked: wasLiked,
        likes: Math.max(0, previous.likes + (wasLiked ? 1 : -1)),
      } : previous);
      showToast("Couldn't update like — check your connection", "error");
    }
  }

  function adjustCommentCount(delta) {
    if (posts.some((item) => item.id === postId)) {
      bumpCommentCount(postId, delta);
      return;
    }

    setPost((previous) => previous ? {
      ...previous,
      commentCount: Math.max(0, (previous.commentCount || 0) + delta),
    } : previous);
  }

  async function handleSubmitComment(event) {
    event.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || !currentUser || sendingComment) return;

    setSendingComment(true);
    try {
      const inserted = await addComment({
        postId,
        authorId: currentUser.id,
        text: trimmed,
      });

      const nextComment = {
        id: inserted.id,
        postId: inserted.post_id,
        authorId: inserted.author_id,
        authorUsername: currentUser.username,
        text: inserted.text,
        createdAt: new Date(inserted.created_at).getTime(),
      };

      setComments((previous) => [...(previous || []), nextComment]);
      warmPeople([currentUser.username]);
      adjustCommentCount(1);
      setCommentText("");
      showToast("Reply added");
    } catch (error) {
      console.error("Add post reply failed:", error);
      showToast("Couldn't send your reply — check your connection", "error");
    } finally {
      setSendingComment(false);
    }
  }

  function canDeleteComment(comment) {
    return !!currentUser && !!visiblePost && (
      comment.authorId === currentUser.id || visiblePost.authorId === currentUser.id
    );
  }

  async function handleDeleteComment(comment) {
    if (deletingCommentId) return;
    setDeletingCommentId(comment.id);

    try {
      await deleteComment(comment.id);
      setComments((previous) => (previous || []).filter((item) => item.id !== comment.id));
      adjustCommentCount(-1);
      showToast("Reply deleted");
    } catch (error) {
      console.error("Delete post reply failed:", error);
      showToast("Couldn't delete that reply — try again", "error");
    } finally {
      setDeletingCommentId(null);
    }
  }

  function focusComments() {
    commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => commentInputRef.current?.focus({ preventScroll: true }));
  }

  const showPostMessage = postLoading || postError || notFound;

  return (
    <div className="post-detail-page">
      <header className="post-detail-topbar">
        <button type="button" className="post-detail-back" onClick={handleBack} aria-label="Go back">
          <BackIcon />
        </button>
        <div>
          <span className="eyebrow">CAMPUS CONNECT</span>
          <h1 className="display">Post</h1>
        </div>
      </header>

      {showPostMessage ? (
        <div className="post-detail-message" role={postError || notFound ? "alert" : undefined}>
          {postLoading ? (
            <p className="subtitle">Loading post…</p>
          ) : postError ? (
            <>
              <h2 className="display">Couldn't load this post</h2>
              <p className="subtitle">Check your connection and try again.</p>
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()} style={{ width: "auto" }}>Try again</button>
            </>
          ) : (
            <>
              <h2 className="display">Post not found</h2>
              <p className="subtitle">It may have been deleted or you may not have access to it.</p>
              <button type="button" className="btn btn-primary" onClick={() => navigate("/feed")} style={{ width: "auto" }}>Back to feed</button>
            </>
          )}
        </div>
      ) : visiblePost ? (
        <>
          <PostCard
            post={visiblePost}
            openOnClick={false}
            showPostMenu={false}
            onLike={handleLike}
            onOpenComments={focusComments}
          />

          <div className="post-detail-view-count" aria-live="polite" title="Each signed-in account is counted once per post.">
            {viewCount !== null ? (
              <><strong>{viewCount.toLocaleString()}</strong> views <small>· unique signed-in accounts</small></>
            ) : viewsUnavailable ? (
              <span>Views are temporarily unavailable.</span>
            ) : (
              <span>Counting views…</span>
            )}
          </div>

          <section className="post-detail-replies" id="comments" ref={commentSectionRef} aria-labelledby="post-detail-replies-title">
            <div className="post-detail-replies-head">
              <h2 className="display" id="post-detail-replies-title">Replies</h2>
              <span>{visiblePost.commentCount} TOTAL</span>
            </div>

            <form className="post-detail-reply-form" onSubmit={handleSubmitComment}>
              <Avatar person={currentUser} size="sm" />
              <div className="post-detail-reply-editor">
                <textarea
                  ref={commentInputRef}
                  className="post-textarea"
                  value={commentText}
                  maxLength={MAX_COMMENT_LENGTH}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Write a reply…"
                  aria-label="Write a reply"
                  disabled={sendingComment}
                />
                <div className="post-detail-reply-actions">
                  <span className="post-detail-char-count">{commentText.length}/{MAX_COMMENT_LENGTH}</span>
                  <button type="submit" className="btn btn-primary" disabled={!commentText.trim() || sendingComment} style={{ width: "auto", padding: "9px 16px" }}>
                    {sendingComment ? "Replying…" : "Reply"}
                  </button>
                </div>
              </div>
            </form>

            <div className="post-detail-comment-list" aria-live="polite">
              {commentsError ? (
                <div className="post-detail-replies-state" role="alert">
                  <p>Couldn't load replies.</p>
                  <button type="button" className="btn btn-ghost" onClick={() => setCommentsReloadKey((key) => key + 1)} style={{ width: "auto", marginTop: 8 }}>Try again</button>
                </div>
              ) : comments === null ? (
                <div className="post-detail-replies-state">Loading replies…</div>
              ) : comments.length === 0 ? (
                <div className="post-detail-replies-state">No replies yet. Start the conversation.</div>
              ) : (
                comments.map((comment) => {
                  const person = getPerson(comment.authorUsername);
                  return (
                    <article className="post-detail-comment" key={comment.id}>
                      <Avatar person={person} size="sm" />
                      <div className="post-detail-comment-body">
                        <div className="post-detail-comment-meta">
                          <button
                            type="button"
                            className="post-detail-comment-author"
                            onClick={() => comment.authorUsername !== "unknown" && navigate(`/profile/${comment.authorUsername}`)}
                            disabled={comment.authorUsername === "unknown"}
                          >
                            {person.name}
                          </button>
                          <span className="post-detail-comment-time">{timeAgo(comment.createdAt)}</span>
                        </div>
                        <div className="post-detail-comment-text">{comment.text}</div>
                      </div>
                      {canDeleteComment(comment) && (
                        <button
                          type="button"
                          className="post-detail-comment-delete"
                          onClick={() => handleDeleteComment(comment)}
                          disabled={deletingCommentId === comment.id}
                          aria-label="Delete reply"
                        >
                          {deletingCommentId === comment.id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
