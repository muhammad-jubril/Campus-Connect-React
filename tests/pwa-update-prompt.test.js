import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("PWA uses prompt-based updates without replacing its combined push service worker", async () => {
  const config = await source("vite.config.js");
  assert.match(config, /registerType:\s*["']prompt["']/);
  assert.doesNotMatch(config, /registerType:\s*["']autoUpdate["']/);
  assert.match(config, /importScripts:\s*\[["']\/push-sw\.js["']\]/);
});

test("the update prompt is mounted once at app-shell level next to the existing install prompt", async () => {
  const app = await source("src/App.jsx");
  assert.match(app, /import PwaUpdatePrompt from ["']\.\/components\/pwa\/PwaUpdatePrompt["']/);
  assert.match(app, /<InstallPrompt\s*\/>[\s\S]*?<\/div>\s*<PwaUpdatePrompt\s*\/>/);
});

test("update overlay only appears for a waiting update and activates it on explicit confirmation", async () => {
  const component = await source("src/components/pwa/PwaUpdatePrompt.jsx");
  assert.match(component, /useRegisterSW\(/);
  assert.match(component, /needRefresh:\s*\[needRefresh\]/);
  assert.match(component, /if \(!needRefresh\) return null/);
  assert.match(component, /await updateServiceWorker\(true\)/);
  assert.match(component, /onRegisteredSW\(/);
  assert.match(component, /UPDATE_CHECK_INTERVAL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(component, /registration\.update\(\)/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /handleLater/);
});

test("the update overlay is responsive, safe-area aware, accessible and honors reduced motion", async () => {
  const css = await source("src/styles/pwa-update-prompt.css");
  assert.match(css, /\.pwa-update-overlay\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /z-index:\s*2200/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
