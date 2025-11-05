import { BrowserWindow } from "electrobun/bun";

// Create the main application window
const rendererUrl = process.env.RENDERER_URL ?? "views://app/index.html";

const mainWindow = new BrowserWindow({
  title: "test",
  url: rendererUrl,
  frame: {
    width: 1024,
    height: 600,
    x: 200,
    y: 200,
  },
});

console.log("Hello Electrobun app started!");
