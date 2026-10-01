import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { useLoader } from "../hooks/useLoader";
import { useToast } from "../hooks/useToast";
import { createPost } from "../services/supabase/posts";
import { uploadToStorage } from "../services/supabase/storage";

const MAX_CHARS = 500;

export default function CreatePostPage() {
  const [text, setText] = useState("");
  const [images, setImages] = useState([]); // [{ file, preview }]
  const [video, setVideo] = useState(null); // { file, preview }
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addPost } = usePosts();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  function handleImagesChange(e) {
    const files = Array.from(e.target.files).slice(0, 3 - images.length);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setImages((prev) => [...prev, { file, preview: ev.target.result }]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function handleVideoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setVideo({ file, preview: ev.target.result });
    e.target.value = "";
  }

  function removeImage(i) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!text.trim() && images.length === 0 && !video) {
      showToast("Write something or add media to post", "error");
      return;
    }
    setSubmitting(true);
    try {
      let newPost;
      await runWithLoader(images.length || video ? "Uploading…" : "Posting…", async () => {
        let mediaType = null;
        let mediaUrls = [];
        if (video) {
          mediaType = "video";
          mediaUrls = [await uploadToStorage("post-media", video.file, currentUser.id)];
        } else if (images.length > 0) {
          mediaType = "image";
          mediaUrls = await Promise.all(images.map((img) => uploadToStorage("post-media", img.file, currentUser.id)));
        }
        newPost = await createPost({
          authorId: currentUser.id, authorUsername: currentUser.username,
          text: text.trim(), mediaType, mediaUrls,
        });
      });
      addPost(newPost);
      showToast("Posted");
      navigate("/feed");
    } catch (err) {
      console.error("Post failed:", err);
      showToast("Couldn't post — check your connection and try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="display" style={{ marginBottom: 4 }}>Create a post</h2>
      <p className="subtitle">Share something with campus.</p>

      <textarea
        className="post-textarea"
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening on campus?"
      />
      <div className="post-char-count">{text.length}/{MAX_CHARS}</div>

      {images.length > 0 && (
        <div className="post-media-preview">
          {images.map((img, i) => (
            <div className="post-media-chip" key={i}>
              <img src={img.preview} alt="" />
              <button type="button" className="remove-media" onClick={() => removeImage(i)}>×</button>
            </div>
          ))}
        </div>
      )}
      {video && (
        <div className="post-media-preview">
          <div className="post-media-chip">
            <video src={video.preview} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button type="button" className="remove-media" onClick={() => setVideo(null)}>×</button>
          </div>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImagesChange} />
      <input ref={videoInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleVideoChange} />
      <div className="post-media-actions">
        <button type="button" className="media-action-btn" disabled={!!video || images.length >= 3} onClick={() => imageInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
          Photo {images.length > 0 ? `(${images.length}/3)` : ""}
        </button>
        <button type="button" className="media-action-btn" disabled={!!video || images.length > 0} onClick={() => videoInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m23 7-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
          Video
        </button>
      </div>

      <div className="spacer" />
      <div className="post-composer-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSubmit}>Post</button>
      </div>
    </div>
  );
}
