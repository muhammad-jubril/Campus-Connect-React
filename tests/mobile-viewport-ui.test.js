import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("mobile document is viewport-locked while auth forms keep an internal scroller", async () => {
  const css = await source("src/styles/globals.css");
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?html,[\s\S]*?body,[\s\S]*?#root[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.screen-auth \.auth-form-panel[\s\S]*?overflow-y:\s*auto/);
});

test("mobile welcome actions have horizontal insets and responsive sizing", async () => {
  const css = await source("src/styles/auth.css");
  assert.match(css, /\.screen-welcome \.welcome-wrap[\s\S]*?padding:[^;]*18px/);
  assert.match(css, /\.screen-welcome \.welcome-wrap \.btn[\s\S]*?width:\s*100%/);
  assert.match(css, /max-width:\s*360px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("username field focus is represented by its wrapper without a duplicate inner halo", async () => {
  const css = await source("src/styles/forms.css");
  assert.match(css, /\.username-field:focus-within[\s\S]*?box-shadow:\s*0 0 0 4px/);
  assert.match(css, /\.username-field input:focus[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /\.username-field input:focus[\s\S]*?outline:\s*none/);
});

test("mobile taps suppress the browser tap highlight without disabling focus styles", async () => {
  const css = await source("src/styles/globals.css");
  const mobileBlock = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(mobileBlock, "expected a mobile-only CSS block");
  assert.match(mobileBlock, /\*,\s*\*::before,\s*\*::after\s*\{\s*-webkit-tap-highlight-color:\s*transparent\s*;/);
  assert.doesNotMatch(css, /(?:^|\n)\s*\*\s*\{[^}]*outline:\s*none/s);
});

