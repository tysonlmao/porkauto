import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import tailwindcss from "@tailwindcss/vite";

/** Same-origin debug ingest for playlist picker runtime evidence. */
function debugLogPlugin(): Plugin {
  const logPath = path.resolve(__dirname, ".cursor/debug-playlist.log");
  return {
    name: "debug-playlist-log",
    configureServer(server) {
      server.middlewares.use("/__debug_log", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const chunks: Uint8Array[] = [];
        req.on("data", (c) => {
          const part =
            c instanceof Uint8Array
              ? new Uint8Array(c.buffer, c.byteOffset, c.byteLength)
              : new Uint8Array(Buffer.from(c));
          chunks.push(part);
        });
        req.on("end", () => {
          try {
            const dir = path.dirname(logPath);
            fs.mkdirSync(dir, { recursive: true });
            const total = chunks.reduce((n, c) => n + c.byteLength, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.byteLength;
            }
            fs.appendFileSync(
              logPath,
              new TextDecoder().decode(merged) + "\n",
              "utf8",
            );
            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), debugLogPlugin()],
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
