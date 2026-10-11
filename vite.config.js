import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The old vanilla-JS build hand-rolled its own sw.js — cache versioning had
// to be bumped by hand on every deploy, or updates silently never reached
// anyone (this bit us more than once). vite-plugin-pwa generates and
// versions the service worker automatically on every build, so that whole
// class of bug goes away for free.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Absolute site origin, used so the browser can tell (via
  // navigator.getInstalledRelatedApps) that this PWA is already installed.
  const siteUrl = (
    env.VITE_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "")
  ).replace(/\/+$/, "");

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Campus Connect — NWU",
        short_name: "Campus Connect",
        description: "Campus social app for Northwest University students",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F4F2ED",
        theme_color: "#1E5C3E",
        orientation: "portrait",
        ...(siteUrl
          ? {
              related_applications: [
                { platform: "webapp", url: `${siteUrl}/manifest.webmanifest` },
              ],
            }
          : {}),
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      // Lets the install prompt be tested with `npm run dev`. Without a
      // service worker the browser never considers the app installable.
      devOptions: { enabled: true, navigateFallback: "index.html" },
      workbox: {
        // Network-first for navigations/API calls, matching the fix we
        // already made once in the vanilla sw.js — never silently serve a
        // stale page when there's a connection available.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
          },
        ],
      },
    }),
  ],
  };
});
