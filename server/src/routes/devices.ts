import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { devices, type DeviceConfig } from "../db/schema";
import {
  generatePairingCode,
  hashSecret,
  signDeviceToken,
} from "../lib/auth";
import {
  requireAuth,
  requireUser,
  type AuthVariables,
} from "../middleware/auth";

export const deviceRoutes = new Hono<{ Variables: AuthVariables }>();

deviceRoutes.post("/register", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}));
  const name =
    typeof body === "object" && body && "name" in body && typeof body.name === "string"
      ? body.name.trim() || "Porkauto Display"
      : "Porkauto Display";

  let pairingCode = generatePairingCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.query.devices.findFirst({
      where: eq(devices.pairingCode, pairingCode),
    });
    if (!clash) break;
    pairingCode = generatePairingCode();
  }

  const deviceSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const deviceSecretHash = await hashSecret(deviceSecret);

  const [device] = await db
    .insert(devices)
    .values({
      name,
      pairingCode,
      deviceSecretHash,
      config: {},
      lastSeenAt: new Date(),
    })
    .returning({
      id: devices.id,
      name: devices.name,
      pairingCode: devices.pairingCode,
      config: devices.config,
      createdAt: devices.createdAt,
    });

  if (!device) {
    throw new HTTPException(500, { message: "Failed to register device" });
  }

  const token = await signDeviceToken(device.id);

  return c.json(
    {
      device,
      pairingCode: device.pairingCode,
      token,
      deviceSecret,
    },
    201,
  );
});

deviceRoutes.post("/claim", requireAuth, requireUser, async (c) => {
  const body = await c.req.json<{ pairingCode?: string }>();
  const pairingCode = body.pairingCode?.trim().toUpperCase();
  if (!pairingCode) {
    throw new HTTPException(400, { message: "pairingCode is required" });
  }

  const auth = c.get("auth");
  if (auth.typ !== "user") {
    throw new HTTPException(403, { message: "User authentication required" });
  }

  const device = await db.query.devices.findFirst({
    where: eq(devices.pairingCode, pairingCode),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found for pairing code" });
  }
  if (device.pairedUserId) {
    throw new HTTPException(409, { message: "Device already claimed" });
  }

  const [updated] = await db
    .update(devices)
    .set({
      pairedUserId: auth.sub,
      lastSeenAt: new Date(),
    })
    .where(eq(devices.id, device.id))
    .returning({
      id: devices.id,
      name: devices.name,
      pairingCode: devices.pairingCode,
      pairedUserId: devices.pairedUserId,
      config: devices.config,
    });

  return c.json({ device: updated });
});

deviceRoutes.get("/:id/config", requireAuth, async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found" });
  }

  const allowed =
    (auth.typ === "device" && auth.sub === device.id) ||
    (auth.typ === "user" && device.pairedUserId === auth.sub);

  if (!allowed) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }

  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, device.id));

  return c.json({
    deviceId: device.id,
    config: device.config,
    paired: Boolean(device.pairedUserId),
  });
});

deviceRoutes.patch("/:id/config", requireAuth, async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const body = await c.req.json<{ config?: DeviceConfig }>();

  if (!body.config || typeof body.config !== "object") {
    throw new HTTPException(400, { message: "config object is required" });
  }

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found" });
  }

  const allowed =
    (auth.typ === "user" && device.pairedUserId === auth.sub) ||
    (auth.typ === "device" && auth.sub === device.id);

  if (!allowed) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }

  const nextConfig: DeviceConfig = {
    ...device.config,
    ...body.config,
  };

  const [updated] = await db
    .update(devices)
    .set({
      config: nextConfig,
      lastSeenAt: new Date(),
    })
    .where(and(eq(devices.id, id)))
    .returning({
      id: devices.id,
      config: devices.config,
    });

  return c.json({ deviceId: updated?.id, config: updated?.config });
});
