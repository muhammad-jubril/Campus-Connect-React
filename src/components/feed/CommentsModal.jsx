import { useEffect, useRef, useState } from "react";
import Avatar from "../common/Avatar";
import ConfirmDialog from "../common/ConfirmDialog";
import { usePeople } from "../../hooks/usePeople";
import { usePosts } from "../../hooks/usePosts";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { addComment, deleteComment, fetchCommentsFor } from "../../services/supabase/comments";
import { timeAgo } from "../../utils/timeAgo";

const MAX_COMMENT_LENGTH = 500;

const getFocusableElements = (container) => Array.from(container.querySelectorAll(
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
)).filter((element) => element.getAttribute("aria-hidden") !== "true");

export default function CommentsModal() {
  const [comments, setComments] = useState(null); // null = loading
  const [commentsError, setCommentsError] = useState(false);
  const [commentsReloadKey, setCommentsReloadKey] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const { getPerson, warmPeople } = usePeople();
  const { activePost: post, closeComments: onClose, bumpCommentCount } = usePosts();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!post) return undefined;
    let cancelled = false;
    setComments(null);
    setCommentsError(false);
    setPendingDelete(null);
    fetchCommentsFor(post.id)
      .then((rows) => {
        if (cancelled) return;
        setComments(rows);
        warmPeople(rows.map((c) => c.authorUsername));
      })
      .catch((error) => {
        console.error("Load comments failed:", error);
        if (!cancelled) setCommentsError(true);
      });
    const focusTimer = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(focusTimer);
    };
  }, [post, warmPeople, commentsReloadKey]);

  useEffect(() => {
    if (!post || pendingDelete) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = getFocusableElements(dialogRef.current);

      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [post, pendingDelete, sending, onClose]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !post || !currentUser || sending) return;
    setSending(true);
    try {
      const inserted = await addComment({ postId: post.id, authorId: currentUser.id, text: trimmed });
      setComments((prev) => [...(prev || []), {
        id: inserted.id,
        postId: inserted.post_id,
        authorId: inserted.author_id,
        authorUsername: currentUser.username,
        text: inserted.text,
        createdAt: new Date(inserted.created_at).getTime(),
      }]);
      bumpCommentCount(post.id, 1);
      setText("");
    } catch (err) {
      console.error("Add comment failed:", err);
      showToast("Couldn't send comment — check your connection", "error");
    } finally {
      setSending(false);
    }
  }

  function canDeleteComment(comment) {
    return !!currentUser && (
      comment.authorId === currentUser.id || post.authorId === currentUser.id
    );
  }

  function requestDelete(comment, event) {
    deleteTriggerRef.current = event.currentTarget;
    setPendingDelete(comment);
  }

  async function handleDeleteComment() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteComment(pendingDelete.id);
      setComments((prev) => (prev || []).filter((comment) => comment.id !== pendingDelete.id));
      bumpCommentCount(post.id, -1);
      showToast("Comment deleted");
      deleteTriggerRef.current = inputRef.current;
      setPendingDelete(null);
    } catch (err) {
      console.error("Delete comment failed:", err);
      showToast("Couldn't delete comment — check your connection", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (!post) return null;

  return (
    <div className={`comments-modal-overlay ${post ? "show" : ""}`} onClick={onClose}>
      <div
        ref={dialogRef}
        className="comments-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="comments-modal-head">
          <h3 id="comments-modal-title" className="display" style={{ fontSize: 18 }}>Comments</h3>
          <button type="button" className="comments-modal-close" onClick={onClose} aria-label="Close comments">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4z" /><path fill="currentColor" d="M18.6 5 6 17.6 4.6 16.2 17.2 3.6z" /></svg>
          </button>
        </div>
        <div className="comments-modal-list">
          {commentsError ? (
            <div className="suggestion-empty" role="alert">
              Couldn't load comments.
              <button type="button" className="btn btn-ghost" onClick={() => setCommentsReloadKey((key) => key + 1)} style={{ width: "auto", marginTop: 8 }}>Try again</button>
            </div>
          ) : comments === null ? (
            <div className="suggestion-empty">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="suggestion-empty">No comments yet — be the first to reply</div>
          ) : (
            comments.map((c) => {
              const author = getPerson(c.authorUsername);
              return (
                <div className="comment-item" key={c.id}>
                  <Avatar person={author} />
                  <div className="comment-body">
                    <div className="comment-author">{author.name}</div>
                    <div className="comment-text">{c.text}</div>
                    <div className="comment-time">{timeAgo(c.createdAt)}</div>
                  </div>
                  {canDeleteComment(c) && (
                    <button
                      type="button"
                      className="comments-modal-close"
                      onClick={(event) => requestDelete(c, event)}
                      aria-label="Delete comment"
                      title="Delete comment"
                      style={{ color: "var(--accent-red)", flexShrink: 0 }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M4 7h16" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M6 7l1 13h10l1-13" />
                        <path d="M9 7V4h6v3" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="comment-input-row">
          <input
            ref={inputRef}
            type="text"
            value={text}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Add a comment…"
            aria-label="Add a comment"
          />
          <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "10px 18px" }} disabled={sending} onClick={handleSend}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete comment?"
        message="This will permanently remove the comment."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteComment}
        returnFocusRef={deleteTriggerRef}
      />
    </div>
  );
}
