import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// In `npm run dev`, serve /privacy and /terms (plain pages in public/) the way Vercel does with cleanUrls.
function cleanUrls() {
  return {
    name: "clean-urls",
    configureServer(server) {
      server.middlewares.use((req, res, next) => { if (/^\/(privacy|terms)\/?$/.test(req.url)) req.url = req.url.replace(/\/?$/, ".html"); next(); });
    },
  };
}

export default defineConfig(() => ({
  // lets a temporary https tunnel (for testing on a phone) reach the dev server
  server: { allowedHosts: [".trycloudflare.com"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    cleanUrls(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Tiền Đâu",
        short_name: "Tiền Đâu",
        description: "Log spending and income in seconds, and split bills with friends.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#EEF1EC",
        theme_color: "#0E5E4E",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // the app shell works offline; Supabase requests always go to the network
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/auth\//, /^\/(privacy|terms)(\.html)?$/],
        // fonts are bundled with the app (Geist), so cache them with the shell for offline use
        globPatterns: ["**/*.{js,css,html,woff2}"],
      },
    }),
  ],
}));
