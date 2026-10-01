import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The old vanilla-JS build hand-rolled its own sw.js — cache versioning had
// to be bumped by hand on every deploy, or updates silently never reached
// anyone (this bit us more than once). vite-plugin-pwa generates and
// versions the service worker automatically on every build, so that whole
// class of bug goes away for free.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Campus Connect — NWU",
        short_name: "Campus Connect",
        description: "Campus social app for Northwest University students",
        start_url: "/",
        display: "standalone",
        background_color: "#F4F2ED",
        theme_color: "#1E5C3E",
        orientation: "portrait",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
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
});
