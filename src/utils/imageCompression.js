const MIB = 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXTENSION_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const IMAGE_UPLOAD_PRESETS = Object.freeze({
  avatar: { maxInputBytes: 10 * MIB, maxDimension: 512, minDimension: 256, maxProcessedBytes: Math.floor(1.5 * MIB), quality: 0.82, skipJpegBytes: 350 * 1024, skipPngBytes: 180 * 1024 },
  post: { maxInputBytes: 15 * MIB, maxDimension: 1600, minDimension: 800, maxProcessedBytes: 4 * MIB, quality: 0.84, skipJpegBytes: 500 * 1024, skipPngBytes: 250 * 1024 },
  listing: { maxInputBytes: 15 * MIB, maxDimension: 2000, minDimension: 1000, maxProcessedBytes: 4 * MIB, quality: 0.84, skipJpegBytes: 500 * 1024, skipPngBytes: 250 * 1024 },
});

export function getImageFileType(file) {
  const declaredType = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  if (declaredType) return declaredType;
  const name = typeof file?.name === "string" ? file.name : "";
  return EXTENSION_TYPES[name.split(".").pop()?.toLowerCase() || ""] || "";
}

function extensionForType(type) {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
}

function nameForType(file, type) {
  const name = typeof file?.name === "string" ? file.name : "image";
  return `${name.replace(/\.[^.]+$/, "") || "image"}.${extensionForType(type)}`;
}

function makeFile(blob, sourceFile, type) {
  return new File([blob], nameForType(sourceFile, type), { type, lastModified: sourceFile.lastModified || Date.now() });
}

function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => ({
      source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.(),
    }));
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      cleanup();
      resolve({ source: image, width, height, close: () => {} });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Couldn't read that image. Try a valid JPEG, PNG, or WebP file."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || !blob.type) {
        reject(new Error("This browser couldn't process the image. Try another image."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export function validateImageInput(file, purpose = "post") {
  const preset = IMAGE_UPLOAD_PRESETS[purpose];
  if (!preset) throw new Error("Unknown image upload purpose.");
  if (!file) throw new Error("Choose an image to upload.");
  const label = purpose === "avatar" ? "10" : "15";
  if (file.size > preset.maxInputBytes) throw new Error(`That original image is too large. Choose an image under ${label} MB.`);
  if (!IMAGE_TYPES.has(getImageFileType(file))) throw new Error("Only JPEG, PNG, and WebP images are supported.");
  return { type: getImageFileType(file), preset };
}

export async function optimizeImage(file, purpose = "post") {
  const { type: inputType, preset } = validateImageInput(file, purpose);
  let decoded;
  try {
    decoded = await loadImage(file);
  } catch {
    throw new Error("Couldn't read that image. Try a valid JPEG, PNG, or WebP file.");
  }

  try {
    const { width: originalWidth, height: originalHeight } = decoded;
    if (!originalWidth || !originalHeight || !Number.isFinite(originalWidth) || !Number.isFinite(originalHeight)) {
      throw new Error("That image has invalid dimensions. Choose another image.");
    }
    if (Math.max(originalWidth, originalHeight) > 25000 || originalWidth * originalHeight > 60000000) {
      throw new Error("That image's dimensions are too large to process safely. Choose a smaller image.");
    }

    const longestEdge = Math.max(originalWidth, originalHeight);
    const dimensionScale = Math.min(1, preset.maxDimension / longestEdge);
    const outputWidth = Math.max(1, Math.round(originalWidth * dimensionScale));
    const outputHeight = Math.max(1, Math.round(originalHeight * dimensionScale));
    const alreadySmallEnough = file.size <= preset.maxProcessedBytes && dimensionScale === 1 &&
      ((inputType === "image/webp") ||
       (inputType === "image/jpeg" && file.size <= preset.skipJpegBytes) ||
       (inputType === "image/png" && file.size <= preset.skipPngBytes));

    if (alreadySmallEnough) {
      const correctName = nameForType(file, inputType);
      if (file.name === correctName && file.type === inputType) return file;
      return new File([file], correctName, { type: inputType, lastModified: file.lastModified || Date.now() });
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");

    const minLongestEdge = Math.min(preset.minDimension, Math.max(outputWidth, outputHeight));
    let scale = dimensionScale;
    let lastSize = null;
    while (true) {
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);

      // Prefer WebP, checking the encoder's actual MIME type rather than assuming support.
      for (const quality of [preset.quality, 0.78, 0.70, 0.62, 0.56]) {
        let blob;
        try { blob = await canvasToBlob(canvas, "image/webp", quality); }
        catch { break; }
        if (blob.type !== "image/webp") break;
        lastSize = blob.size;
        if (blob.size <= preset.maxProcessedBytes) return makeFile(blob, file, blob.type);
      }

      // Fallback preserves transparency for PNG sources on browsers without WebP encoding.
      const fallbackType = inputType === "image/jpeg" ? "image/jpeg" : "image/png";
      const qualities = fallbackType === "image/jpeg" ? [0.82, 0.74, 0.66, 0.58] : [undefined];
      for (const quality of qualities) {
        let blob;
        try { blob = await canvasToBlob(canvas, fallbackType, quality); }
        catch { break; }
        lastSize = blob.size;
        if (blob.size <= preset.maxProcessedBytes) return makeFile(blob, file, blob.type);
      }

      const currentLongest = Math.max(width, height);
      if (currentLongest <= minLongestEdge || scale <= 0.25) break;
      scale = Math.max(scale * 0.85, minLongestEdge / longestEdge);
    }

    const maxMb = purpose === "avatar" ? "1.5" : "4";
    throw new Error(`This image couldn't be reduced below ${maxMb} MB. Choose a smaller image and try again.${lastSize ? "" : " Image processing failed."}`);
  } finally {
    decoded.close();
  }
}

// Compatibility wrapper for older internal call sites.
export async function compressImage(file, maxLongEdge, quality = 0.8) {
  const purpose = maxLongEdge <= 512 ? "avatar" : "post";
  const processed = await optimizeImage(file, purpose);
  if (processed.size <= IMAGE_UPLOAD_PRESETS[purpose].maxProcessedBytes && quality >= 0) return processed;
  throw new Error("The image could not be compressed to the required upload size.");
}
