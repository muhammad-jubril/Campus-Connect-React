import test from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_UPLOAD_PRESETS,
  detectImageType,
  isAnimatedImage,
  validateImageInput,
  validateOptimizedImage,
} from "../src/utils/imageCompression.js";
import { checkPostMedia } from "../src/utils/uploadChecks.js";

const KiB = 1024;
const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function createFile(bytes, name, type) {
  return new File([bytes], name, { type });
}

test("beta image presets meet the selected byte and dimension budgets", () => {
  assert.deepEqual(
    {
      avatarDimension: IMAGE_UPLOAD_PRESETS.avatar.maxDimension,
      avatarBytes: IMAGE_UPLOAD_PRESETS.avatar.maxProcessedBytes,
      feedDimension: IMAGE_UPLOAD_PRESETS.post.maxDimension,
      feedBytes: IMAGE_UPLOAD_PRESETS.post.maxProcessedBytes,
      listingDimension: IMAGE_UPLOAD_PRESETS.listing.maxDimension,
      listingBytes: IMAGE_UPLOAD_PRESETS.listing.maxProcessedBytes,
    },
    {
      avatarDimension: 400,
      avatarBytes: 150 * KiB,
      feedDimension: 1200,
      feedBytes: 350 * KiB,
      listingDimension: 1200,
      listingBytes: 400 * KiB,
    },
  );
});

test("image type detection checks file signatures, not just extensions", async () => {
  assert.equal(await detectImageType(createFile(jpegHeader, "photo.jpg", "image/jpeg")), "image/jpeg");
  assert.equal(await detectImageType(createFile(pngHeader, "photo.png", "image/png")), "image/png");
  assert.equal(await detectImageType(createFile(webpHeader, "photo.webp", "image/webp")), "image/webp");
  assert.equal(await detectImageType(createFile(jpegHeader, "photo.png", "image/png")), "image/jpeg");
});

test("upload input rejects unsupported types and originals above the source limit", () => {
  assert.throws(
    () => validateImageInput(createFile(jpegHeader, "video.mp4", "video/mp4"), "post"),
    /Only JPEG, PNG, and WebP/,
  );
  assert.throws(
    () => validateImageInput(createFile(new Uint8Array(10 * KiB), "large.jpg", "image/jpeg"), "avatar"),
    /contents don't match|supported JPEG|supported image/,
  );
  assert.throws(
    () => validateImageInput({ name: "big.jpg", type: "image/jpeg", size: 11 * 1024 * 1024 }, "avatar"),
    /original image is too large/,
  );
});

test("processed image validation rejects oversized output and MIME/signature mismatch", async () => {
  const validSmallJpeg = createFile(jpegHeader, "small.jpg", "image/jpeg");
  assert.equal(await validateOptimizedImage(validSmallJpeg, "avatar"), validSmallJpeg);

  const tooLarge = createFile(new Uint8Array(150 * KiB + 1).fill(0), "large.jpg", "image/jpeg");
  assert.rejects(() => validateOptimizedImage(tooLarge, "avatar"), /exceeds the 150 KB limit/);

  const mismatched = createFile(pngHeader, "fake.jpg", "image/jpeg");
  await assert.rejects(() => validateOptimizedImage(mismatched, "post"), /don't match/);
});

test("animated PNG and WebP are rejected rather than silently flattened", async () => {
  const animatedPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x08, 0x61, 0x63, 0x54, 0x4c,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
  ]);
  const animatedWebp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x41, 0x4e, 0x4d, 0x46, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  assert.equal(await isAnimatedImage(createFile(animatedPng, "animated.png", "image/png"), "image/png"), true);
  assert.equal(await isAnimatedImage(createFile(animatedWebp, "animated.webp", "image/webp"), "image/webp"), true);
  assert.equal(await isAnimatedImage(createFile(jpegHeader, "still.jpg", "image/jpeg"), "image/jpeg"), false);
});

test("the feed upload checks reject videos", () => {
  assert.deepEqual(checkPostMedia({ name: "clip.mp4", size: 1024, type: "video/mp4" }), { ok: false, reason: "video" });
});
