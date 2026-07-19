import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// La version affichée dans l'app provient du package.json, tenu à jour par
// semantic-release à chaque merge sur main.
const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "push-sw.js"],
      // On garde la stratégie generateSW (précache Workbox) et on y injecte nos
      // gestionnaires Web Push via un script séparé (public/push-sw.js) plutôt
      // que de passer à injectManifest : plus simple, précache inchangé.
      workbox: {
        importScripts: ["push-sw.js"],
      },
      manifest: {
        name: "Racontine",
        short_name: "Racontine",
        description: "Le journal numérique de l'enfance",
        theme_color: "#faf8f3",
        background_color: "#faf8f3",
        display: "standalone",
        lang: "fr",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3010",
    },
  },
});
