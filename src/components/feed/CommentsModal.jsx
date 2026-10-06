import { useEffect, useRef, useState } from "react";
import Avatar from "../common/Avatar";
import { usePeople } from "../../hooks/usePeople";
import { usePosts } from "../../hooks/usePosts";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { fetchCommentsFor, addComment } from "../../services/supabase/comments";
import { timeAgo } from "../../utils/timeAgo";

export default function CommentsModal() {
  const [comments, setComments] = useState(null); // null = loading
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);
  const { getPerson, warmPeople } = usePeople();
  const { activePost: post, closeComments: onClose, bumpCommentCount } = usePosts();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    setComments(null);
    fetchCommentsFor(post.id).then((rows) => {
      if (cancelled) return;
      setComments(rows);
      warmPeople(rows.map((c) => c.authorUsername));
    });
    setTimeout(() => inputRef.current?.focus(), 250);
    return () => { cancelled = true; };
  }, [post]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !post || !currentUser || sending) return;
    setSending(true);
    try {
      await addComment({ postId: post.id, authorId: currentUser.id, text: trimmed });
      setComments((prev) => [...(prev || []), { authorUsername: currentUser.username, text: trimmed, createdAt: Date.now() }]);
      bumpCommentCount(post.id, 1);
      setText("");
    } catch (err) {
      showToast("Couldn't send comment — check your connection", "error");
    } finally {
      setSending(false);
    }
  }

  if (!post) return null;

  return (
    <div className={`comments-modal-overlay ${post ? "show" : ""}`} onClick={onClose}>
      <div className="comments-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="comments-modal-head">
          <h3 className="display" style={{ fontSize: 18 }}>Comments</h3>
          <button type="button" className="comments-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4z" /><path fill="currentColor" d="M18.6 5 6 17.6 4.6 16.2 17.2 3.6z" /></svg>
          </button>
        </div>
        <div className="comments-modal-list">
          {comments === null ? (
            <div className="suggestion-empty">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="suggestion-empty">No comments yet — be the first to reply</div>
          ) : (
            comments.map((c, i) => {
              const author = getPerson(c.authorUsername);
              return (
                <div className="comment-item" key={i}>
                  <Avatar person={author} />
                  <div className="comment-body">
                    <div className="comment-author">{author.name}</div>
                    <div className="comment-text">{c.text}</div>
                    <div className="comment-time">{timeAgo(c.createdAt)}</div>
                  </div>
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Add a comment…"
          />
          <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "10px 18px" }} disabled={sending} onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
