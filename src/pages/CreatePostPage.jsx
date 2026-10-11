import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { useLoader } from "../hooks/useLoader";
import { useToast } from "../hooks/useToast";
import { createPost } from "../services/supabase/posts";
import { uploadToStorage, removeUploadedFile } from "../services/supabase/storage";
import { checkPostMedia, uploadCheckMessage } from "../utils/uploadChecks";
import { getUploadErrorMessage } from "../utils/uploadErrors";
import { optimizeImage } from "../utils/imageCompression";

const MAX_CHARS = 500;
const MAX_IMAGES = 4;

export default function CreatePostPage() {
  const [text, setText] = useState("");
  const [images, setImages] = useState([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef(null);
  const previewUrlsRef = useRef(new Set());
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addPost } = usePosts();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, []);

  async function handleImagesChange(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selectedFiles.length) return;

    const availableSlots = Math.max(0, MAX_IMAGES - images.length);
    if (availableSlots === 0) {
      showToast("A post can contain at most four images.", "error");
      return;
    }
    const filesToProcess = selectedFiles.slice(0, availableSlots);
    const skippedForLimit = selectedFiles.length > availableSlots;
    const processedImages = [];
    let rejectionMessage = null;

    setProcessingImages(true);
    try {
      // Process sequentially to avoid keeping several large decoded images in memory.
      for (const file of filesToProcess) {
        const result = checkPostMedia(file);
        if (!result.ok) {
          rejectionMessage ||= uploadCheckMessage(result, "post");
          continue;
        }
        try {
          const processedFile = await optimizeImage(file, "post");
          const preview = URL.createObjectURL(processedFile);
          previewUrlsRef.current.add(preview);
          processedImages.push({ file: processedFile, preview });
        } catch (error) {
          console.error("Post image processing failed:", error);
          rejectionMessage ||= error?.message || "Couldn't optimize that image. Try another JPEG, PNG, or WebP image.";
        }
      }

      setImages((previous) => {
        const capacity = Math.max(0, MAX_IMAGES - previous.length);
        const accepted = processedImages.slice(0, capacity);
        processedImages.slice(capacity).forEach((image) => {
          URL.revokeObjectURL(image.preview);
          previewUrlsRef.current.delete(image.preview);
        });
        return [...previous, ...accepted];
      });

      if (skippedForLimit) showToast("A post can contain at most four images. Extra selections were skipped.", "error");
      else if (rejectionMessage) showToast(rejectionMessage, "error");
    } finally {
      setProcessingImages(false);
    }
  }

  function removeImage(index) {
    const image = images[index];
    if (image?.preview) {
      URL.revokeObjectURL(image.preview);
      previewUrlsRef.current.delete(image.preview);
    }
    setImages((previous) => previous.filter((_, imageIndex) => imageIndex !== index));
  }

  async function handleSubmit() {
    if (submitting || processingImages) return;
    const trimmedText = text.trim();
    if (text.length > MAX_CHARS) {
      showToast("Post text must be 500 characters or fewer.", "error");
      return;
    }
    if (!trimmedText && images.length === 0) {
      showToast("Write something or add at least one image to post.", "error");
      return;
    }
    if (images.length > MAX_IMAGES) {
      showToast("A post can contain at most four images.", "error");
      return;
    }

    setSubmitting(true);
    const uploadedUrls = [];
    try {
      let newPost;
      await runWithLoader(images.length ? "Uploading images…" : "Posting…", async () => {
        let mediaType = null;
        const mediaUrls = [];
        if (images.length) {
          mediaType = "image";
          // Upload the already-optimized files shown in the previews.
          for (const image of images) {
            const url = await uploadToStorage("post-media", image.file, currentUser.id);
            uploadedUrls.push(url);
            mediaUrls.push(url);
          }
        }
        newPost = await createPost({
          authorId: currentUser.id,
          authorUsername: currentUser.username,
          text: trimmedText,
          mediaType,
          mediaUrls,
        });
      });

      addPost(newPost);
      showToast("Posted");
      navigate("/feed", { replace: true });
    } catch (error) {
      await Promise.allSettled(uploadedUrls.map((url) => removeUploadedFile("post-media", url)));
      console.error("Post failed:", error);
      const friendlyMessage = getUploadErrorMessage(error, "post");
      showToast(friendlyMessage || error?.message || "Couldn't post — check your connection and try again", "error");
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
      <p className="subtitle">Text, plus up to four optimized images. Video uploads aren't supported in the beta.</p>

      <textarea
        id="post-text"
        className="post-textarea"
        value={text}
        maxLength={MAX_CHARS}
        onChange={(event) => setText(event.target.value)}
        placeholder="What's happening on campus?"
        aria-describedby="post-char-count"
      />
      <div className="post-char-count" id="post-char-count" aria-live="polite">
        <span>{text.length}</span>/{MAX_CHARS} characters
      </div>

      {images.length > 0 && (
        <div className="post-media-preview">
          {images.map((image, index) => (
            <div className="post-media-chip" key={image.preview}>
              <img src={image.preview} alt="" />
              <button type="button" className="remove-media" onClick={() => removeImage(index)} disabled={processingImages} aria-label={"Remove image " + (index + 1)}>×</button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={handleImagesChange}
        aria-label="Choose post images"
      />

      <div className="post-media-actions">
        <button
          type="button"
          className="media-action-btn"
          disabled={processingImages || submitting || images.length >= MAX_IMAGES}
          onClick={() => imageInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
          {processingImages ? "Optimizing…" : "Photo"}
        </button>
        <span className="hint" style={{ margin: "0 0 0 auto" }}>{images.length ? images.length + "/" + MAX_IMAGES + " images" : ""}</span>
      </div>

      <div className="spacer" />
      <div className="post-composer-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={submitting}>Cancel</button>
        <button type="button" className="btn btn-primary" style={{ width: "auto", flex: 1 }} onClick={handleSubmit} disabled={submitting || processingImages}>
          {submitting ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
