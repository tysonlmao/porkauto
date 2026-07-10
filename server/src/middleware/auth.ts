import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { devices } from "../db/schema";
import {
  verifySecret,
  verifyToken,
  type TokenPayload,
} from "../lib/auth";

export type AuthVariables = {
  auth: TokenPayload;
};

/**
 * Accepts either:
 * - Authorization: Bearer <JWT> (user | device | owner)
 * - Authorization: Bearer <apiKey> with device id in the path (`:id`),
 *   verified against device_secret_hash or owner_token_hash
 */
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
      return;
    } catch {
      // Fall through: treat as raw API key for device-scoped routes.
    }

    const deviceId = c.req.param("id");
    if (!deviceId) {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    const device = await db.query.devices.findFirst({
      where: eq(devices.id, deviceId),
    });
    if (!device) {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    if (device.ownerTokenHash && (await verifySecret(token, device.ownerTokenHash))) {
      c.set("auth", { sub: device.id, typ: "owner" });
      await next();
      return;
    }

    if (
      device.deviceSecretHash &&
      (await verifySecret(token, device.deviceSecretHash))
    ) {
      c.set("auth", { sub: device.id, typ: "device" });
      await next();
      return;
    }

    throw new HTTPException(401, { message: "Invalid or expired token" });
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

export function isDeviceClaimed(device: {
  claimedAt: Date | null;
  ownerTokenHash: string | null;
  pairedUserId: string | null;
}): boolean {
  return Boolean(device.claimedAt || device.ownerTokenHash || device.pairedUserId);
}

export function isDeviceConfirmed(device: {
  confirmedAt: Date | null;
}): boolean {
  return Boolean(device.confirmedAt);
}

export type PairingStatus = "unpaired" | "pending" | "confirmed";

export function pairingStatus(device: {
  claimedAt: Date | null;
  ownerTokenHash: string | null;
  pairedUserId: string | null;
  confirmedAt: Date | null;
}): PairingStatus {
  if (!isDeviceClaimed(device)) return "unpaired";
  if (isDeviceConfirmed(device)) return "confirmed";
  return "pending";
}

export function canAccessDevice(
  auth: TokenPayload,
  device: {
    id: string;
    pairedUserId: string | null;
  },
): boolean {
  if (auth.typ === "device" && auth.sub === device.id) return true;
  if (auth.typ === "owner" && auth.sub === device.id) return true;
  if (auth.typ === "user" && device.pairedUserId === auth.sub) return true;
  return false;
}
