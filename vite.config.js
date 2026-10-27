import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// In `npm run dev`, serve the Vercel functions in /api too, so "Read with AI" works locally.
// The server-only key (ANTHROPIC_API_KEY, no VITE_ prefix) is read from .env and never sent to the browser.
function localApi(env) {
  return {
    name: "local-api",
    configureServer(server) {
      if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
      server.middlewares.use("/api/read-receipt", async (req, res) => {
        const mod = await server.ssrLoadModule("/api/read-receipt.js");
        await mod.default(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    localApi(loadEnv(mode, process.cwd(), "")),
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
        navigateFallbackDenylist: [/^\/auth\//],
        // fonts are bundled with the app (Geist), so cache them with the shell for offline use
        globPatterns: ["**/*.{js,css,html,woff2}"],
      },
    }),
  ],
}));
