#!/usr/bin/env bun
/**
 * OpenTUI dashboard: Vite + API + Cloudflare tunnel in one terminal.
 *
 * Usage: bun run dev:tunnel
 */

import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";

const viteUrl = process.env.VITE_TUNNEL_TARGET ?? "http://127.0.0.1:5173";
const apiUrl = process.env.VITE_API_URL ?? "http://127.0.0.1:3001";
const MAX_LOG_LINES = 400;
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

const COLORS = {
  bg: "#1a1b26",
  panel: "#16161e",
  header: "#24283b",
  muted: "#565f89",
  text: "#c0caf5",
  brand: "#7dcfff",
  api: "#7dcfff",
  vite: "#9ece6a",
  tunnel: "#bb9af7",
  ready: "#9ece6a",
  starting: "#e0af68",
  failed: "#f7768e",
  idle: "#565f89",
  url: "#73daca",
  reqIn: "#7aa2f7",
  reqOk: "#9ece6a",
  reqWarn: "#e0af68",
  reqErr: "#f7768e",
} as const;

type ServiceId = "api" | "vite" | "tunnel";
type ServiceStatus = "idle" | "starting" | "ready" | "failed" | "reused";

type ServicePane = {
  id: ServiceId;
  label: string;
  accent: string;
  border: BoxRenderable;
  logs: ScrollBoxRenderable;
  statusChip: TextRenderable;
  lineCount: number;
};

const children: Array<ReturnType<typeof Bun.spawn>> = [];
let shuttingDown = false;
let tunnelUrlText: TextRenderable | null = null;

async function freePort(port: number) {
  try {
    const proc = Bun.spawn(["fuser", "-k", `${port}/tcp`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  } catch {
    // fuser may be unavailable
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs = 60_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(url)) return true;
    await Bun.sleep(400);
  }
  return false;
}

function statusColor(status: ServiceStatus): string {
  switch (status) {
    case "ready":
    case "reused":
      return COLORS.ready;
    case "starting":
      return COLORS.starting;
    case "failed":
      return COLORS.failed;
    default:
      return COLORS.idle;
  }
}

function statusLabel(status: ServiceStatus): string {
  switch (status) {
    case "ready":
      return "ready";
    case "reused":
      return "reused";
    case "starting":
      return "starting";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

function setStatus(pane: ServicePane, status: ServiceStatus) {
  const label = statusLabel(status);
  const color = statusColor(status);
  pane.statusChip.content = ` ${pane.label} · ${label} `;
  pane.statusChip.fg = color;
  pane.border.borderColor = status === "failed" ? COLORS.failed : pane.accent;
  if (status === "ready" || status === "reused") {
    pane.border.title = ` ${pane.label} ● `;
  } else if (status === "starting") {
    pane.border.title = ` ${pane.label} … `;
  } else if (status === "failed") {
    pane.border.title = ` ${pane.label} ✕ `;
  } else {
    pane.border.title = ` ${pane.label} `;
  }
}

function colorForLog(pane: ServicePane, line: string, fallback: string): string {
  if (pane.id === "api" && line.includes("[req]")) {
    if (line.includes("← 5") || line.includes("(error)")) return COLORS.reqErr;
    if (line.includes("← 4") || line.includes("(warn)")) return COLORS.reqWarn;
    if (line.includes("← ")) return COLORS.reqOk;
    if (line.includes("→ ")) return COLORS.reqIn;
  }
  return fallback;
}

function appendLog(pane: ServicePane, renderer: CliRenderer, line: string, fg = COLORS.text) {
  const cleaned = line.replace(/\r/g, "").replace(/\x1b\[[0-9;]*m/g, "");
  if (!cleaned.trim()) return;

  if (pane.id === "tunnel") {
    const match = cleaned.match(TUNNEL_URL_RE);
    if (match?.[0] && tunnelUrlText) {
      tunnelUrlText.content = match[0];
      tunnelUrlText.fg = COLORS.url;
      setStatus(pane, "ready");
    }
  }

  const text = new TextRenderable(renderer, {
    content: cleaned,
    fg: colorForLog(pane, cleaned, fg),
    wrapMode: "char",
    width: "100%",
    selectable: false,
  });
  pane.logs.add(text);
  pane.lineCount += 1;

  while (pane.lineCount > MAX_LOG_LINES) {
    const kids = pane.logs.getChildren();
    const first = kids[0];
    if (!first) break;
    pane.logs.remove(first);
    first.destroy();
    pane.lineCount -= 1;
  }
}

async function pipeStream(
  stream: ReadableStream<Uint8Array> | number | null,
  onLine: (line: string) => void,
) {
  if (!stream || typeof stream === "number") return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const part of parts) onLine(part);
    }
    if (buf) onLine(buf);
  } catch {
    // stream closed during shutdown
  }
}

function spawnService(
  name: string,
  cmd: string[],
  pane: ServicePane,
  renderer: CliRenderer,
): ReturnType<typeof Bun.spawn> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
  if (name === "api") {
    env.API_VERBOSE = "1";
  }

  const child = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env,
  });
  children.push(child);
  appendLog(pane, renderer, `started ${name} (pid ${child.pid})`, COLORS.muted);
  if (name === "api") {
    appendLog(pane, renderer, "verbose request logging enabled", COLORS.muted);
  }

  void pipeStream(child.stdout, (line) => appendLog(pane, renderer, line));
  void pipeStream(child.stderr, (line) =>
    appendLog(pane, renderer, line, COLORS.starting),
  );

  void child.exited.then((code) => {
    if (shuttingDown) return;
    if (code !== 0) {
      setStatus(pane, "failed");
      appendLog(pane, renderer, `exited with code ${code}`, COLORS.failed);
    } else {
      appendLog(pane, renderer, `exited cleanly`, COLORS.muted);
    }
  });

  return child;
}

function buildUi(renderer: CliRenderer): Record<ServiceId, ServicePane> {
  const shell = new BoxRenderable(renderer, {
    id: "shell",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: COLORS.bg,
    border: false,
  });

  const header = new BoxRenderable(renderer, {
    id: "header",
    width: "100%",
    height: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.header,
    paddingLeft: 1,
    paddingRight: 1,
    border: false,
    flexShrink: 0,
  });

  const brand = new TextRenderable(renderer, {
    content: " porkauto ",
    fg: COLORS.brand,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  const subtitle = new TextRenderable(renderer, {
    content: "dev",
    fg: COLORS.muted,
    selectable: false,
  });

  const brandRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    backgroundColor: COLORS.header,
    border: false,
    flexShrink: 0,
  });
  brandRow.add(brand);
  brandRow.add(subtitle);

  const chips = new BoxRenderable(renderer, {
    flexDirection: "row",
    gap: 1,
    alignItems: "center",
    backgroundColor: COLORS.header,
    border: false,
    flexShrink: 0,
  });

  const makeChip = (label: string, accent: string) =>
    new TextRenderable(renderer, {
      content: ` ${label} · idle `,
      fg: accent,
      attributes: TextAttributes.BOLD,
      selectable: false,
    });

  const apiChip = makeChip("API", COLORS.api);
  const viteChip = makeChip("Vite", COLORS.vite);
  const tunnelChip = makeChip("Tunnel", COLORS.tunnel);
  chips.add(apiChip);
  chips.add(viteChip);
  chips.add(tunnelChip);

  header.add(brandRow);
  header.add(chips);

  const urlBar = new BoxRenderable(renderer, {
    id: "url-bar",
    width: "100%",
    height: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    paddingLeft: 1,
    border: false,
  });
  const urlLabel = new TextRenderable(renderer, {
    content: "public  ",
    fg: COLORS.muted,
    selectable: false,
  });
  tunnelUrlText = new TextRenderable(renderer, {
    content: "waiting for cloudflared…",
    fg: COLORS.muted,
    selectable: true,
  });
  urlBar.add(urlLabel);
  urlBar.add(tunnelUrlText);

  const panesRow = new BoxRenderable(renderer, {
    id: "panes",
    width: "100%",
    flexGrow: 1,
    flexDirection: "row",
    gap: 1,
    backgroundColor: COLORS.bg,
    padding: 0,
    border: false,
  });

  const makePane = (
    id: ServiceId,
    label: string,
    accent: string,
    chip: TextRenderable,
  ): ServicePane => {
    const border = new BoxRenderable(renderer, {
      id: `pane-${id}`,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: accent,
      focusedBorderColor: accent,
      title: ` ${label} `,
      titleColor: accent,
      backgroundColor: COLORS.panel,
      focusable: false,
    });

    const logs = new ScrollBoxRenderable(renderer, {
      id: `logs-${id}`,
      flexGrow: 1,
      width: "100%",
      stickyScroll: true,
      stickyStart: "bottom",
      focusable: true,
      focusedBorderColor: accent,
      rootOptions: { backgroundColor: COLORS.panel, border: false },
      wrapperOptions: { backgroundColor: COLORS.panel, border: false },
      viewportOptions: { backgroundColor: COLORS.panel, border: false },
      contentOptions: { backgroundColor: COLORS.panel, border: false, gap: 0 },
      scrollbarOptions: {
        trackOptions: {
          foregroundColor: accent,
          backgroundColor: COLORS.header,
        },
      },
    });

    border.add(logs);
    panesRow.add(border);

    return {
      id,
      label,
      accent,
      border,
      logs,
      statusChip: chip,
      lineCount: 0,
    };
  };

  const panes: Record<ServiceId, ServicePane> = {
    api: makePane("api", "API", COLORS.api, apiChip),
    vite: makePane("vite", "Vite", COLORS.vite, viteChip),
    tunnel: makePane("tunnel", "Tunnel", COLORS.tunnel, tunnelChip),
  };

  const footer = new BoxRenderable(renderer, {
    id: "footer",
    width: "100%",
    height: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.header,
    paddingLeft: 1,
    paddingRight: 1,
    border: false,
  });
  footer.add(
    new TextRenderable(renderer, {
      content: " 1/2/3 focus pane   q quit   open the public URL on your iPad ",
      fg: COLORS.muted,
      selectable: false,
    }),
  );

  shell.add(header);
  shell.add(urlBar);
  shell.add(panesRow);
  shell.add(footer);
  renderer.root.add(shell);

  return panes;
}

async function shutdown(renderer: CliRenderer) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // already exited
    }
  }
  await Bun.sleep(150);
  for (const child of children) {
    try {
      child.kill(9);
    } catch {
      // already exited
    }
  }
  try {
    renderer.destroy();
  } catch {
    // ignore
  }
  process.exit(0);
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    backgroundColor: COLORS.bg,
    targetFps: 30,
    useMouse: true,
  });

  const panes = buildUi(renderer);
  const paneOrder: ServiceId[] = ["api", "vite", "tunnel"];

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      key.preventDefault();
      void shutdown(renderer);
      return;
    }
    if (key.name === "1" || key.name === "2" || key.name === "3") {
      const idx = Number(key.name) - 1;
      const id = paneOrder[idx];
      if (id) panes[id].logs.focus();
      key.preventDefault();
    }
  });

  panes.api.logs.focus();
  setStatus(panes.api, "starting");
  setStatus(panes.vite, "idle");
  setStatus(panes.tunnel, "idle");

  // --- API ---
  if (!(await isUp(apiUrl + "/health"))) {
    await freePort(3001);
    setStatus(panes.api, "starting");
    appendLog(panes.api, renderer, "starting API…", COLORS.muted);
    spawnService("api", ["bun", "run", "dev:api"], panes.api, renderer);
    if (!(await waitFor(apiUrl + "/health"))) {
      setStatus(panes.api, "failed");
      appendLog(panes.api, renderer, `API did not become ready at ${apiUrl}`, COLORS.failed);
      return;
    }
    setStatus(panes.api, "ready");
    appendLog(panes.api, renderer, `ready at ${apiUrl}`, COLORS.ready);
  } else {
    setStatus(panes.api, "reused");
    appendLog(panes.api, renderer, `using existing API at ${apiUrl}`, COLORS.ready);
  }

  // --- Vite ---
  setStatus(panes.vite, "starting");
  if (!(await isUp(viteUrl))) {
    appendLog(panes.vite, renderer, "starting Vite…", COLORS.muted);
    spawnService("vite", ["bun", "run", "dev:renderer"], panes.vite, renderer);
    if (!(await waitFor(viteUrl))) {
      setStatus(panes.vite, "failed");
      appendLog(panes.vite, renderer, `Vite did not become ready at ${viteUrl}`, COLORS.failed);
      return;
    }
    setStatus(panes.vite, "ready");
    appendLog(panes.vite, renderer, `ready at ${viteUrl}`, COLORS.ready);
  } else {
    setStatus(panes.vite, "reused");
    appendLog(panes.vite, renderer, `using existing Vite at ${viteUrl}`, COLORS.ready);
  }

  // --- Tunnel ---
  setStatus(panes.tunnel, "starting");
  appendLog(panes.tunnel, renderer, `forwarding → ${viteUrl}`, COLORS.muted);
  appendLog(
    panes.tunnel,
    renderer,
    "open the https://*.trycloudflare.com URL on your iPad",
    COLORS.muted,
  );
  spawnService(
    "tunnel",
    ["cloudflared", "tunnel", "--url", viteUrl],
    panes.tunnel,
    renderer,
  );

  process.on("SIGINT", () => void shutdown(renderer));
  process.on("SIGTERM", () => void shutdown(renderer));
}

await main();
