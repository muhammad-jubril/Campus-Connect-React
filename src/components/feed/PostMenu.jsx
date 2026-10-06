import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import { useAuth } from "../../hooks/useAuth";
import { usePosts } from "../../hooks/usePosts";
import { useToast } from "../../hooks/useToast";

export default function PostMenu({ post, onEdit }) {
  const { currentUser } = useAuth();
  const { removePost } = usePosts();
  const { showToast } = useToast();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const firstItemRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!currentUser && currentUser.id === post.authorId;

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => firstItemRef.current?.focus());

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!isOwner) return null;

  function handleEdit() {
    setOpen(false);
    onEdit();
  }

  function handleDeleteRequest() {
    setOpen(false);
    setConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    if (deleting) return;
    setDeleting(true);
    try {
      await removePost(post.id);
      setConfirmOpen(false);
      showToast("Post deleted");
    } catch (err) {
      console.error("Delete post failed:", err);
      showToast("Couldn't delete post — check your connection", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", flexShrink: 0 }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: 32,
          height: 32,
          border: "none",
          borderRadius: "50%",
          background: open ? "rgba(28,27,23,0.08)" : "transparent",
          color: "rgba(28,27,23,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Post actions"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 30,
            minWidth: 150,
            padding: 6,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--surface)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={handleEdit}
            style={menuItemStyle}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDeleteRequest}
            style={{ ...menuItemStyle, color: "var(--accent-red)" }}
          >
            Delete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete post?"
        message="This will permanently remove your post."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        returnFocusRef={buttonRef}
      />
    </div>
  );
}

const menuItemStyle = {
  display: "block",
  width: "100%",
  border: "none",
  borderRadius: 8,
  background: "transparent",
  padding: "9px 10px",
  textAlign: "left",
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ink)",
  cursor: "pointer",
};
