const MIB = 1024 * 1024;
const KIB = 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXTENSION_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const MAX_IMAGE_PIXELS = 40_000_000;

export const IMAGE_UPLOAD_PRESETS = Object.freeze({
  avatar: {
    maxInputBytes: 10 * MIB,
    maxDimension: 400,
    minDimension: 200,
    maxProcessedBytes: 150 * KIB,
    quality: 0.82,
  },
  post: {
    maxInputBytes: 15 * MIB,
    maxDimension: 1200,
    minDimension: 600,
    maxProcessedBytes: 350 * KIB,
    quality: 0.83,
  },
  listing: {
    maxInputBytes: 15 * MIB,
    maxDimension: 1200,
    minDimension: 600,
    maxProcessedBytes: 400 * KIB,
    quality: 0.83,
  },
});

export function getImageFileType(file) {
  const declaredType = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  if (declaredType) return declaredType;
  const name = typeof file?.name === "string" ? file.name : "";
  return EXTENSION_TYPES[name.split(".").pop()?.toLowerCase() || ""] || "";
}

export async function detectImageType(file) {
  if (!file || typeof file.slice !== "function") return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

function readAscii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Canvas decoding can flatten animated formats to one frame. Reject APNG and
 * animated WebP instead of silently turning them into misleading still images.
 */
export async function isAnimatedImage(file, type) {
  if (type !== "image/png" && type !== "image/webp") return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (type === "image/png") {
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const chunkLength = view.getUint32(offset, false);
      const chunkType = readAscii(bytes, offset + 4, 4);
      if (chunkType === "acTL") return true;
      if (chunkType === "IEND") return false;
      const next = offset + 12 + chunkLength;
      if (next <= offset || next > bytes.length) return false;
      offset = next;
    }
    return false;
  }

  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") {
    return false;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    if (chunkType === "ANIM" || chunkType === "ANMF") return true;
    const next = offset + 8 + chunkLength + (chunkLength % 2);
    if (next <= offset || next > bytes.length) return false;
    offset = next;
  }
  return false;
}

function extensionForType(type) {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
}

function nameForType(file, type) {
  const name = typeof file?.name === "string" ? file.name : "image";
  return \`${name.replace(/\.[^.]+$/, "") || "image"}.${extensionForType(type)}\`;
}

function makeFile(blob, sourceFile, type = blob.type) {
  if (!IMAGE_TYPES.has(type) || blob.type !== type) {
    throw new Error("The browser returned an unsupported image format. Please try another image.");
  }
  return new File([blob], nameForType(sourceFile, type), {
    type,
    lastModified: sourceFile.lastModified || Date.now(),
  });
}

function wrapAlreadyOptimizedFile(file, type) {
  // Return a fresh File object with canonical MIME/extension metadata. If a file
  // already meets the dimensions and byte budget its original bytes are safe to
  // retain; otherwise it goes through canvas processing below.
  return new File([file], nameForType(file, type), {
    type,
    lastModified: file.lastModified || Date.now(),
  });
}

async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.(),
      };
    } catch {
      // Fall back to Image decoding for browsers/files createImageBitmap cannot read.
    }
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
  if (file.size > preset.maxInputBytes) {
    throw new Error(\`That original image is too large. Choose an image under ${label} MB.\`);
  }
  const type = getImageFileType(file);
  if (!IMAGE_TYPES.has(type)) {
    throw new Error("Only JPEG, PNG, and WebP images are supported.");
  }
  return { type, preset };
}

/** Revalidate processed output immediately before upload, including its byte signature. */
export async function validateOptimizedImage(file, purpose = "post") {
  const preset = IMAGE_UPLOAD_PRESETS[purpose];
  if (!preset) throw new Error("Unknown image upload purpose.");
  if (!file || !IMAGE_TYPES.has(file.type)) {
    throw new Error("Only processed JPEG, PNG, or WebP images can be uploaded.");
  }
  if (file.size > preset.maxProcessedBytes) {
    throw new Error(\`The processed image exceeds the ${Math.round(preset.maxProcessedBytes / KIB)} KB limit. Choose another image.\`);
  }
  const actualType = await detectImageType(file);
  if (actualType !== file.type) {
    throw new Error("The file contents don't match the image format. Choose a valid JPEG, PNG, or WebP image.");
  }
  return file;
}

export async function optimizeImage(file, purpose = "post") {
  const { type: inputType, preset } = validateImageInput(file, purpose);
  const actualType = await detectImageType(file);
  if (!actualType) throw new Error("The file contents aren't a supported JPEG, PNG, or WebP image.");
  if (actualType !== inputType) {
    throw new Error("The file contents don't match the selected image format. Save it as JPEG, PNG, or WebP and try again.");
  }
  if (await isAnimatedImage(file, inputType)) {
    throw new Error("Animated images aren't supported. Choose a still JPEG, PNG, or WebP image.");
  }

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
    if (Math.max(originalWidth, originalHeight) > 25000 || originalWidth * originalHeight > MAX_IMAGE_PIXELS) {
      throw new Error("That image's dimensions are too large to process safely. Choose a smaller image.");
    }

    const longestEdge = Math.max(originalWidth, originalHeight);
    const dimensionScale = Math.min(1, preset.maxDimension / longestEdge);
    const outputWidth = Math.max(1, Math.round(originalWidth * dimensionScale));
    const outputHeight = Math.max(1, Math.round(originalHeight * dimensionScale));

    if (file.size <= preset.maxProcessedBytes && dimensionScale === 1) {
      return validateOptimizedImage(wrapAlreadyOptimizedFile(file, inputType), purpose);
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");

    const startingLongestEdge = Math.max(outputWidth, outputHeight);
    const minLongestEdge = Math.min(
      preset.minDimension,
      Math.max(96, Math.floor(startingLongestEdge * 0.5)),
      startingLongestEdge,
    );
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

      // Prefer WebP for compact output. Check the actual MIME returned by the
      // browser, because unsupported encoders may silently return PNG instead.
      let webpEncoderAvailable = true;
      for (const quality of [preset.quality, 0.76, 0.68, 0.60, 0.52]) {
        let blob;
        try {
          blob = await canvasToBlob(canvas, "image/webp", quality);
        } catch {
          webpEncoderAvailable = false;
          break;
        }
        if (blob.type !== "image/webp") {
          webpEncoderAvailable = false;
          break;
        }
        lastSize = blob.size;
        if (blob.size <= preset.maxProcessedBytes) {
          return validateOptimizedImage(makeFile(blob, file), purpose);
        }
      }

      // JPEG fallback is appropriate for JPEG inputs; PNG fallback retains alpha
      // for transparent PNG/WebP sources. No fallback ever uploads the raw file.
      const fallbackType = inputType === "image/jpeg" ? "image/jpeg" : "image/png";
      const qualities = fallbackType === "image/jpeg" ? [0.82, 0.74, 0.66, 0.58] : [undefined];
      for (const quality of qualities) {
        let blob;
        try {
          blob = await canvasToBlob(canvas, fallbackType, quality);
        } catch {
          continue;
        }
        if (!IMAGE_TYPES.has(blob.type)) continue;
        lastSize = blob.size;
        if (blob.size <= preset.maxProcessedBytes) {
          return validateOptimizedImage(makeFile(blob, file, blob.type), purpose);
        }
      }

      // Avoid an unused-variable lint error while retaining the explanatory
      // check above: WebP failure intentionally falls through to safe fallback.
      void webpEncoderAvailable;
      const currentLongest = Math.max(width, height);
      if (currentLongest <= minLongestEdge || scale <= 0.25) break;
      scale = Math.max(scale * 0.85, minLongestEdge / longestEdge);
    }

    const maxKb = Math.round(preset.maxProcessedBytes / KIB);
    throw new Error(
      \`This image couldn't be reduced below ${maxKb} KB. Choose a smaller image and try again.${lastSize === null ? " Image processing failed." : ""}\`,
    );
  } finally {
    decoded.close();
  }
}

// Compatibility wrapper for older internal call sites.
export async function compressImage(file, maxLongEdge, quality = 0.8) {
  const purpose = maxLongEdge <= 512 ? "avatar" : "post";
  if (quality < 0) throw new Error("Invalid image quality.");
  return optimizeImage(file, purpose);
}
