import { useEffect, useRef, useState } from "react";
import { usePosts } from "../../hooks/usePosts";
import { useToast } from "../../hooks/useToast";

const MAX_CHARS = 600;

export default function EditPostForm({ post, onCancel, onSaved }) {
  const [value, setValue] = useState(post.text || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);
  const { updatePostText } = usePosts();
  const { showToast } = useToast();

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(value.length, value.length);
  }, []);

  async function handleSave() {
    if (saving) return;

    const trimmed = value.trim();
    if (trimmed.length > MAX_CHARS) {
      setError(`Post text must be ${MAX_CHARS} characters or fewer`);
      return;
    }
    if (!trimmed && !post.media) {
      setError("Write something or keep media attached");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await updatePostText(post.id, trimmed);
      showToast("Post updated");
      onSaved?.();
    } catch (err) {
      console.error("Update post failed:", err);
      showToast("Couldn't update post — check your connection", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && !saving) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="edit-post-form" style={{ marginBottom: 10 }}>
      <textarea
        ref={textareaRef}
        className="post-textarea"
        value={value}
        maxLength={MAX_CHARS}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError("");
        }}
        onKeyDown={handleKeyDown}
        aria-label="Edit post text"
      />
      <div className="post-char-count"><span>{value.length}</span>/{MAX_CHARS}</div>
      {error && <div className="hint" style={{ color: "var(--accent-red)", marginTop: -10, marginBottom: 10 }}>{error}</div>}
      <div className="post-composer-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="btn btn-primary" style={{ width: "auto", flex: 1 }} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
