import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("report details textarea uses the app's rounded, responsive form style", async () => {
  const [dialog, css] = await Promise.all([
    read("src/components/safety/ReportDialog.jsx"),
    read("src/styles/report-dialog.css"),
  ]);
  assert.match(dialog, /styles\/report-dialog\.css/);
  assert.match(css, /\.content-report-dialog \.field textarea\s*\{/);
  assert.match(css, /box-sizing:\s*border-box/);
  assert.match(css, /width:\s*100%/);
  assert.match(css, /border-radius:\s*12px 18px 18px 18px/);
  assert.match(css, /\.content-report-dialog \.field textarea:focus/);
  assert.match(css, /box-shadow:\s*0 0 0 4px rgba\(30, 92, 62, 0\.1\)/);
});

test("grouped notifications reserve visible avatar-stack space before summary copy", async () => {
  const [component, css] = await Promise.all([
    read("src/components/notifications/NotificationItem.jsx"),
    read("src/styles/notifications.css"),
  ]);
  assert.match(component, /const avatarCount = previewActors\.length \+ \(group\.actors\.length > 3 \? 1 : 0\)/);
  assert.match(component, /notification-card--avatars-\$\{avatarCount\}/);
  for (const width of ["29px", "53px", "77px", "99px", "26px", "47px", "68px", "90px"]) {
    assert.ok(css.includes(`--notification-avatar-space: ${width}`), `missing avatar stack width ${width}`);
  }
  assert.match(css, /flex:\s*0 0 var\(--notification-avatar-space/);
  assert.match(css, /padding-left:\s*calc\(12px \+ var\(--notification-avatar-space, 68px\) \+ 10px\)/);
  assert.match(css, /\.notification-avatar-wrap \.notification-avatar \{ flex: 0 0 100%; width: 100%; height: 100%; \}/);
});
