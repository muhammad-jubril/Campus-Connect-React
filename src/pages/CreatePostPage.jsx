import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { useLoader } from "../hooks/useLoader";
import { useToast } from "../hooks/useToast";
import { createPost } from "../services/supabase/posts";
import { uploadToStorage } from "../services/supabase/storage";
import { checkPostMedia, checkVideoDuration, getVideoDuration, uploadCheckMessage } from "../utils/uploadChecks";
import { getUploadErrorMessage } from "../utils/uploadErrors";
import { compressImage } from "../utils/imageCompression";

const MAX_CHARS = 600;
const MAX_IMAGES = 10;
const MAX_IMAGE_DIMENSION = 1600;

export default function CreatePostPage() {
  const [text, setText] = useState("");
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addPost } = usePosts();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  function handleImagesChange(e) {
    const selectedFiles = Array.from(e.target.files).slice(0, MAX_IMAGES - images.length);
    const acceptedFiles = [];
    let rejectedMessage = null;

    selectedFiles.forEach((file) => {
      const result = checkPostMedia(file);
      if (!result.ok) {
        rejectedMessage ||= uploadCheckMessage(result, "post");
        return;
      }
      acceptedFiles.push(file);
    });

    if (rejectedMessage) showToast(rejectedMessage, "error");

    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setImages((prev) => {
        if (prev.length >= MAX_IMAGES) return prev;
        return [...prev, { file, preview: ev.target.result }];
      });
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  }

  async function handleVideoChange(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const result = checkPostMedia(file);
    if (!result.ok) {
      showToast(uploadCheckMessage(result, "post"), "error");
      return;
    }

    try {
      const duration = await getVideoDuration(file);
      if (!checkVideoDuration(duration).ok) {
        showToast("That video is too long (max 30 seconds)", "error");
        return;
      }
    } catch (err) {
      console.error("Video metadata check failed:", err);
      showToast("Couldn't read that video — try another file", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setVideo({ file, preview: ev.target.result });
    reader.readAsDataURL(file);
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
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
          const compressedImages = await Promise.all(
            images.map((img) => compressImage(img.file, MAX_IMAGE_DIMENSION, 0.8))
          );
          mediaUrls = await Promise.all(
            compressedImages.map((file) => uploadToStorage("post-media", file, currentUser.id))
          );
        }

        newPost = await createPost({
          authorId: currentUser.id,
          authorUsername: currentUser.username,
          text: text.trim(),
          mediaType,
          mediaUrls,
        });
      });

      addPost(newPost);
      showToast("Posted");
      navigate("/feed", { replace: true });
    } catch (err) {
      console.error("Post failed:", err);
      const friendlyMessage = getUploadErrorMessage(err, "post");
      showToast(friendlyMessage || "Couldn't post — check your connection and try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="create-post-page">
      <div className="task-header">
        <div>
          <span className="eyebrow">SHARE WITH CAMPUS</span>
          <h2 className="display">New post</h2>
        </div>
      </div>
      <p className="subtitle">Text, plus up to 10 images or one 30-second video.</p>

      <textarea
        id="post-text"
        className="post-textarea"
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening on campus?"
      />
      <div className="post-char-count"><span>{text.length}</span>/{MAX_CHARS}</div>

      {images.length > 0 && (
        <div className="post-media-preview">
          {images.map((img, index) => (
            <div className="post-media-chip" key={`${img.file.name}-${index}`}>
              <img src={img.preview} alt="" />
              <button type="button" className="remove-media" onClick={() => removeImage(index)} aria-label={`Remove image ${index + 1}`}>×</button>
            </div>
          ))}
        </div>
      )}

      {video && (
        <div className="post-media-preview">
          <div className="post-media-chip">
            <video src={video.preview} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
            <button type="button" className="remove-media" onClick={() => setVideo(null)} aria-label="Remove video">×</button>
          </div>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={handleImagesChange} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: "none" }} onChange={handleVideoChange} />

      <div className="post-media-actions">
        <button type="button" className="media-action-btn" disabled={!!video || images.length >= MAX_IMAGES} onClick={() => imageInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
          Photo
        </button>
        <button type="button" className="media-action-btn" disabled={!!video || images.length > 0} onClick={() => videoInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m23 7-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
          Video
        </button>
        <span className="hint" style={{ margin: "0 0 0 auto" }}>{video ? "Video attached" : images.length ? `${images.length}/${MAX_IMAGES} images` : ""}</span>
      </div>

      <div className="spacer" />
      <div className="post-composer-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        <button type="button" className="btn btn-primary" style={{ width: "auto", flex: 1 }} onClick={handleSubmit} disabled={submitting}>Post</button>
      </div>
    </div>
  );
}
