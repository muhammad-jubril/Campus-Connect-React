import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("desktop Settings navigation opens the real Settings route, not the placeholder side panel", async () => {
  const [sidebar, panel, routes, settingsPage] = await Promise.all([
    readFile(new URL("src/components/layout/Sidebar.jsx", root), "utf8"),
    readFile(new URL("src/components/layout/DesktopRightPanel.jsx", root), "utf8"),
    readFile(new URL("src/routes/AppRoutes.jsx", root), "utf8"),
    readFile(new URL("src/pages/SettingsPage.jsx", root), "utf8"),
  ]);

  assert.match(sidebar, /<NavLink to="\/settings" className="desktop-sidebar-link">[\s\S]*?<b>Settings<\/b>[\s\S]*?<\/NavLink>/);
  assert.doesNotMatch(sidebar, /<SidebarPanelLink to="\/settings"/);
  assert.doesNotMatch(panel, /settings: \{[\s\S]{0,220}Coming soon/);
  assert.doesNotMatch(panel, /panelKey === "settings"/);
  assert.match(routes, /<Route path="\/settings" element=\{<ScreenLayout><SettingsPage \/><\/ScreenLayout>\}/);
  assert.match(settingsPage, /Phone push notifications/);
  assert.match(settingsPage, /Notification preferences|Post likes/);
});
