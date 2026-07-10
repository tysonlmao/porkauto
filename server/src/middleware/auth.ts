import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken, type TokenPayload } from "../lib/auth";

export type AuthVariables = {
  auth: TokenPayload;
};

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Missing bearer token" });
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new HTTPException(401, { message: "Missing bearer token" });
    }

    try {
      const payload = await verifyToken(token);
      c.set("auth", payload);
      await next();
    } catch {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }
  },
);

export const requireUser = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = c.get("auth");
    if (!auth || auth.typ !== "user") {
      throw new HTTPException(403, { message: "User authentication required" });
    }
    await next();
  },
);
