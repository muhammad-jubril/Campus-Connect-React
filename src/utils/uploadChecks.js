import { getImageFileType, IMAGE_UPLOAD_PRESETS } from "./imageCompression";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function checkAvatar(file) {
  if (!file) return { ok: false, reason: "type" };
  if (file.size > IMAGE_UPLOAD_PRESETS.avatar.maxInputBytes) return { ok: false, reason: "size" };
  if (!IMAGE_TYPES.has(getImageFileType(file))) return { ok: false, reason: "type" };
  return { ok: true, type: getImageFileType(file) };
}

export function checkPostMedia(file) {
  if (!file) return { ok: false, reason: "type" };
  const type = getImageFileType(file);
  if (type.startsWith("video/")) return { ok: false, reason: "video" };
  if (file.size > IMAGE_UPLOAD_PRESETS.post.maxInputBytes) return { ok: false, reason: "size" };
  if (!IMAGE_TYPES.has(type)) return { ok: false, reason: "type" };
  return { ok: true, type };
}

export function uploadCheckMessage(result, kind = "post") {
  if (result?.reason === "video") return "Video uploads aren't supported in the beta. Choose a JPEG, PNG, or WebP image.";
  if (result?.reason === "size") {
    return kind === "avatar" ? "That original photo is too large (max 10 MB)" : "That original image is too large (max 15 MB)";
  }
  if (result?.reason === "type") return "Only JPEG, PNG, and WebP images are supported";
  return null;
}
