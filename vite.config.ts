import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  root: path.resolve(__dirname, "src/app"),
  base: "./",
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: false,
    // Allow iPad access via Cloudflare quick tunnel (real HTTPS cert).
    allowedHosts: true,
    // Same-origin API for Cloudflare tunnel / iPad Safari (HTTPS page can't call :3001).
    proxy: {
      "/geo": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/devices": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/integrations": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/app"),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
