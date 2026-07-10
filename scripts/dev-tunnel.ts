#!/usr/bin/env bun
/**
 * Expose the Vite renderer on a real HTTPS URL (trusted cert) for iPad Safari.
 *
 * Starts Vite (:5173) and the API (:3001) if needed, then cloudflared.
 * Device register / claim / geo go Vite → proxy → API (same-origin for iPad Safari).
 */

const viteUrl = process.env.VITE_TUNNEL_TARGET ?? "http://127.0.0.1:5173";
const apiUrl = process.env.VITE_API_URL ?? "http://127.0.0.1:3001";

async function isUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(url)) return true;
    await Bun.sleep(400);
  }
  console.error(`[tunnel] ${label} did not become ready at ${url}`);
  return false;
}

const children: Array<ReturnType<typeof Bun.spawn>> = [];

function spawn(name: string, cmd: string[]) {
  const child = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: process.env,
  });
  children.push(child);
  console.log(`[tunnel] started ${name} (pid ${child.pid})`);
  return child;
}

if (!(await isUp(apiUrl + "/health"))) {
  console.log("[tunnel] API not up — starting…");
  spawn("api", ["bun", "run", "dev:api"]);
  if (!(await waitFor(apiUrl + "/health", "API"))) process.exit(1);
} else {
  console.log(`[tunnel] using existing API at ${apiUrl}`);
}

if (!(await isUp(viteUrl))) {
  console.log("[tunnel] Vite not up — starting…");
  spawn("vite", ["bun", "run", "dev:renderer"]);
  if (!(await waitFor(viteUrl, "Vite"))) process.exit(1);
} else {
  console.log(`[tunnel] using existing Vite at ${viteUrl}`);
}

console.log(`[tunnel] forwarding → ${viteUrl}`);
console.log(
  "[tunnel] open the https://*.trycloudflare.com URL printed below on your iPad\n",
);

const tunnel = Bun.spawn(["cloudflared", "tunnel", "--url", viteUrl], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});
children.push(tunnel);

const shutdown = () => {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await tunnel.exited;
shutdown();
