import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { users } from "../db/schema";
import {
  hashPassword,
  signUserToken,
  verifyPassword,
} from "../lib/auth";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !emailRegex.test(email)) {
    throw new HTTPException(400, { message: "Valid email is required" });
  }
  if (!password || password.length < 8) {
    throw new HTTPException(400, {
      message: "Password must be at least 8 characters",
    });
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    throw new HTTPException(409, { message: "Email already registered" });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning({ id: users.id, email: users.email, createdAt: users.createdAt });

  if (!user) {
    throw new HTTPException(500, { message: "Failed to create user" });
  }

  const token = await signUserToken(user.id, user.email);
  return c.json({ user, token }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    throw new HTTPException(400, { message: "Email and password are required" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const token = await signUserToken(user.id, user.email);
  return c.json({
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    token,
  });
});
