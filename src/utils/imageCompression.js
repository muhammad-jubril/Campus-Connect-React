function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => {
      cleanup();
      resolve(image);
    };

    image.onerror = () => {
      cleanup();
      reject(new Error("Unable to decode image"));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Image compression failed"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function extensionForType(type) {
  return type === "image/jpeg" ? "jpg" : "webp";
}

export async function compressImage(file, maxLongEdge, quality = 0.8) {
  const image = await loadImage(file);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestEdge > maxLongEdge ? maxLongEdge / longestEdge : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.drawImage(image, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, "image/webp", quality);
  let outputType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";

  if (outputType === "image/jpeg") {
    blob = await canvasToBlob(canvas, outputType, quality);
  }

  if (blob.size >= file.size && scale === 1) return file;

  const originalName = typeof file.name === "string" ? file.name : "image";
  const baseName = originalName.replace(/\.[^.]+$/, "") || "image";
  const extension = extensionForType(outputType);
  return new File([blob], `${baseName}-compressed.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}
