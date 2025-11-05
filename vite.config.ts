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
    port: 5173,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: path.resolve(__dirname, "dist/app"),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
