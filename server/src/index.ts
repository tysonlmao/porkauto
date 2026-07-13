import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { resolveJwtSecret } from "./lib/auth";
import { requestLog } from "./middleware/requestLog";
import { authRoutes } from "./routes/auth";
import { deviceRoutes } from "./routes/devices";
import { geoRoutes } from "./routes/geo";
import {
  deviceIntegrationRoutes,
  spotifyCallbackRoutes,
} from "./routes/integrations";

// Fail fast if JWT_SECRET is missing / insecure in production.
resolveJwtSecret();

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use("*", requestLog());

app.get("/health", (c) =>
  c.json({ ok: true, service: "porkauto-api", ts: Date.now() }),
);

app.route("/auth", authRoutes);
app.route("/devices", deviceRoutes);
app.route("/devices", deviceIntegrationRoutes);
app.route("/integrations", spotifyCallbackRoutes);
app.route("/geo", geoRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.API_PORT ?? 3001);

console.log(`porkauto API listening on http://0.0.0.0:${port}`);

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
