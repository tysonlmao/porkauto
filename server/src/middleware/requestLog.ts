import type { MiddlewareHandler } from "hono";

const SKIP = new Set(["/health"]);

/** High-frequency pairing / Spotify link polls — noise in the TUI. */
const DEVICE_CONFIG_RE = /^\/devices\/[^/]+\/config$/;
const DEVICE_INTEGRATIONS_RE = /^\/devices\/[^/]+\/integrations$/;

function shouldSkipLog(method: string, path: string): boolean {
  if (SKIP.has(path) || method === "OPTIONS") return true;
  if (method === "GET" && DEVICE_CONFIG_RE.test(path)) return true;
  if (method === "GET" && DEVICE_INTEGRATIONS_RE.test(path)) return true;
  return false;
}

function redactAuth(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.toLowerCase().startsWith("bearer ")) {
    const token = value.slice(7);
    if (token.length <= 8) return "Bearer ***";
    return `Bearer ${token.slice(0, 4)}…${token.slice(-4)}`;
  }
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Verbose HTTP request logger for local debugging (TUI / `API_VERBOSE=1`).
 */
export const requestLog = (): MiddlewareHandler => {
  const verbose =
    process.env.API_VERBOSE === "1" ||
    process.env.API_VERBOSE === "true" ||
    process.env.NODE_ENV !== "production";

  return async (c, next) => {
    const path = c.req.path;
    if (!verbose || shouldSkipLog(c.req.method, path)) {
      await next();
      return;
    }

    const started = performance.now();
    const url = new URL(c.req.url);
    const qs = url.search || "";
    const auth = redactAuth(c.req.header("authorization"));
    const ct = c.req.header("content-type");

    const extras: string[] = [];
    if (ct) extras.push(`ct=${ct}`);
    if (auth) extras.push(`auth=${auth}`);

    console.log(
      `[req] → ${c.req.method} ${path}${qs}${extras.length ? `  ${extras.join(" ")}` : ""}`,
    );

    await next();

    const ms = Math.round(performance.now() - started);
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "ok";
    console.log(`[req] ← ${status} ${c.req.method} ${path}${qs}  ${ms}ms  (${level})`);
  };
};
