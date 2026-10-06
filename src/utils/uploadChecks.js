const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_POST_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const EXTENSION_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function getFileType(file) {
  const declaredType = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  if (declaredType) return declaredType;

  const name = typeof file?.name === "string" ? file.name : "";
  const extension = name.split(".").pop()?.toLowerCase() || "";
  return EXTENSION_TYPES[extension] || "";
}

export function checkAvatar(file) {
  if (!file) return { ok: false, reason: "type" };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, reason: "size" };
  if (!IMAGE_TYPES.has(getFileType(file))) return { ok: false, reason: "type" };
  return { ok: true };
}

export function checkPostMedia(file) {
  if (!file) return { ok: false, reason: "type" };
  if (file.size > MAX_POST_MEDIA_BYTES) return { ok: false, reason: "size" };

  const type = getFileType(file);
  if (!IMAGE_TYPES.has(type) && !VIDEO_TYPES.has(type)) {
    return { ok: false, reason: "type" };
  }

  return { ok: true, type };
}

export function uploadCheckMessage(result, kind = "post") {
  if (result?.reason === "size") {
    return kind === "avatar"
      ? "That photo is too large (max 2 MB)"
      : "That file is too large (max 50 MB)";
  }

  if (result?.reason === "type") return "That file type isn't supported";
  return null;
}

export function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Video metadata is unavailable"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Unable to read video metadata"));
    };
    video.src = objectUrl;
  });
}

export function checkVideoDuration(duration) {
  return {
    ok: Number.isFinite(duration) && duration <= MAX_VIDEO_SECONDS,
    maxSeconds: MAX_VIDEO_SECONDS,
  };
}
