import { supabase } from "./client";
import { IMAGE_UPLOAD_PRESETS, validateOptimizedImage } from "../../utils/imageCompression";

const BUCKET_PURPOSES = Object.freeze({
  avatars: "avatar",
  "post-media": "post",
});

function extensionForType(type) {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
}

function uniqueId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function assertUploadAllowed(bucket, file) {
  const purpose = BUCKET_PURPOSES[bucket];
  if (!purpose) throw new Error("Uploads to this storage bucket aren't supported here.");
  await validateOptimizedImage(file, purpose);

  const limit = IMAGE_UPLOAD_PRESETS[purpose].maxProcessedBytes;
  if (file.size > limit) {
    throw new Error(bucket === "avatars"
      ? "The processed profile photo exceeds the 150 KB upload limit."
      : "The processed feed image exceeds the 350 KB upload limit.");
  }
}

export async function uploadToStorage(bucket, file, userId) {
  await assertUploadAllowed(bucket, file);
  if (!userId) throw new Error("Sign in before uploading an image.");
  const path = `${userId}/${uniqueId()}.${extensionForType(file.type)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeUploadedFile(bucket, publicUrl) {
  if (!BUCKET_PURPOSES[bucket] || typeof publicUrl !== "string") return;
  let pathname;
  try { pathname = new URL(publicUrl).pathname; }
  catch { throw new Error("Cannot identify the uploaded file for cleanup."); }
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = pathname.indexOf(marker);
  if (index < 0) throw new Error("Cannot identify the uploaded file for cleanup.");
  const path = decodeURIComponent(pathname.slice(index + marker.length));
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
