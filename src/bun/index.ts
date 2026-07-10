import { BrowserWindow } from "electrobun/bun";

async function getRendererUrl(): Promise<string> {
  if (process.env.RENDERER_URL) {
    return process.env.RENDERER_URL;
  }

  // Prefer HTTP localhost — it is a secure context and avoids self-signed TLS errors.
  try {
    const response = await fetch("http://localhost:5173");
    if (response.ok) {
      return "http://localhost:5173";
    }
  } catch {
    // Vite not running — fall back to bundled views
  }

  return "views://app/index.html";
}

const mainWindow = new BrowserWindow({
  title: "porkauto",
  url: await getRendererUrl(),
  frame: {
    width: 1280,
    height: 720,
    x: 100,
    y: 100,
  },
});

void mainWindow;
