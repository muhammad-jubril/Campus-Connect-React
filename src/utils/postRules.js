export const MAX_POST_CHARS = 500;
export const MAX_POST_IMAGES = 4;

/**
 * Shared validation for feed text and media.
 * Keep this aligned with enforce_beta_post_rules in Supabase migrations.
 */
export function validatePostPayload({ text, mediaType, mediaUrls }) {
  const rawText = typeof text === "string" ? text : "";
  const urls = Array.isArray(mediaUrls) ? mediaUrls : [];
  const safeText = rawText.trim();

  if (rawText.length > MAX_POST_CHARS) {
    throw new Error(`Post text must be ${MAX_POST_CHARS} characters or fewer.`);
  }
  if (!safeText && urls.length === 0) {
    throw new Error("Write something or add at least one image to post.");
  }
  if (mediaType === "video") {
    throw new Error("Video uploads aren't supported in the beta.");
  }
  if (mediaType !== null && mediaType !== "image") {
    throw new Error("This post media type isn't supported.");
  }
  if (urls.length > MAX_POST_IMAGES) {
    throw new Error(`A post can contain at most ${MAX_POST_IMAGES} images.`);
  }
  if (mediaType === "image" && urls.length === 0) {
    throw new Error("Choose at least one image.");
  }
  if (mediaType !== "image" && urls.length > 0) {
    throw new Error("Post images need a valid media type.");
  }

  return { text: safeText, mediaType, mediaUrls: urls };
}
