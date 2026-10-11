import { supabase } from "./client";
import { detectImageType } from "../../utils/imageCompression";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET_RULES = {
  avatars: { maxBytes: Math.floor(1.5 * 1024 * 1024) },
  "post-media": { maxBytes: 4 * 1024 * 1024 },
};

function extensionForType(type) {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
}

function uniqueId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function assertUploadAllowed(bucket, file) {
  const rules = BUCKET_RULES[bucket];
  if (!rules) throw new Error("Uploads to this storage bucket aren't supported here.");
  if (!file || !IMAGE_TYPES.has(file.type)) {
    throw new Error("Only processed JPEG, PNG, or WebP images can be uploaded.");
  }
  if (file.size > rules.maxBytes) {
    throw new Error(bucket === "avatars"
      ? "The processed profile photo exceeds the 1.5 MB upload limit."
      : "The processed image exceeds the 4 MB upload limit.");
  }
  const actualType = await detectImageType(file);
  if (actualType !== file.type) {
    throw new Error("The file contents don't match the image format. Choose a valid JPEG, PNG, or WebP image.");
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
  if (!BUCKET_RULES[bucket] || typeof publicUrl !== "string") return;
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
