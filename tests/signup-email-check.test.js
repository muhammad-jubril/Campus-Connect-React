import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const functionUrl = new URL("supabase/functions/check-signup-email/index.ts", root);
const uiUrl = new URL("src/components/auth/EmailVerification.jsx", root);

test("signup email availability function permits the deployed production origin and preserves configured origins", async () => {
  const source = await readFile(functionUrl, "utf8");
  assert.match(source, /https:\/\/mycampusconnectt\.vercel\.app/);
  assert.match(source, /DEFAULT_ALLOWED_ORIGINS/);
  assert.match(source, /ENV_ALLOWED_ORIGINS/);
  assert.match(source, /new Set\(\[\.\.\.DEFAULT_ALLOWED_ORIGINS, \.\.\.ENV_ALLOWED_ORIGINS\]\)/);
  assert.match(source, /Access-Control-Allow-Origin/);
  assert.match(source, /Access-Control-Allow-Methods.*POST, OPTIONS/);
});

test("signup UI distinguishes email-check transport/server failures from invalid and existing emails", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /checkSignupEmail\(normalizedEmail\)/);
  assert.match(source, /We couldn't check that email right now\. Please try again\./);
  assert.match(source, /rate_limited/);
  assert.match(source, /invalid_email/);
});
