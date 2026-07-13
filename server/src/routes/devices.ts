import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { devices, type DeviceConfig } from "../db/schema";
import {
  generateApiKey,
  generatePairingCode,
  hashSecret,
  signDeviceToken,
  signOwnerToken,
  verifySecret,
} from "../lib/auth";
import {
  canAccessDevice,
  isDeviceClaimed,
  isDeviceConfirmed,
  pairingStatus,
  requireAuth,
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

  const deviceSecret = generateApiKey();
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
      apiKey: deviceSecret,
      deviceSecret,
    },
    201,
  );
});

/**
 * Claim a display with its pairing code (pending until host confirms).
 * Optional `name` is the companion phone/tablet's friendly device name.
 */
deviceRoutes.post("/claim", async (c) => {
  const body = await c.req.json<{ pairingCode?: string; name?: string }>();
  const pairingCode = body.pairingCode?.trim().toUpperCase();
  if (!pairingCode) {
    throw new HTTPException(400, { message: "pairingCode is required" });
  }

  const companionName =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : null;

  const device = await db.query.devices.findFirst({
    where: eq(devices.pairingCode, pairingCode),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found for pairing code" });
  }
  if (isDeviceClaimed(device)) {
    throw new HTTPException(409, { message: "Device already claimed" });
  }

  const apiKey = generateApiKey();
  const ownerTokenHash = await hashSecret(apiKey);
  const claimedAt = new Date();

  const [updated] = await db
    .update(devices)
    .set({
      ownerTokenHash,
      companionName,
      claimedAt,
      confirmedAt: null,
      lastSeenAt: claimedAt,
    })
    .where(eq(devices.id, device.id))
    .returning({
      id: devices.id,
      name: devices.name,
      pairingCode: devices.pairingCode,
      companionName: devices.companionName,
      claimedAt: devices.claimedAt,
      confirmedAt: devices.confirmedAt,
      config: devices.config,
    });

  const token = await signOwnerToken(device.id);

  return c.json({
    device: updated,
    apiKey,
    token,
    pairingStatus: "pending" as const,
    confirmed: false,
  });
});

/**
 * Host confirms a pending companion claim.
 */
deviceRoutes.post("/:id/confirm", requireAuth, async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");

  if (auth.typ !== "device" || auth.sub !== id) {
    throw new HTTPException(403, { message: "Only the display can confirm pairing" });
  }

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found" });
  }
  if (!isDeviceClaimed(device)) {
    throw new HTTPException(409, { message: "No pending claim to confirm" });
  }

  const confirmedAt = device.confirmedAt ?? new Date();
  const [updated] = await db
    .update(devices)
    .set({
      confirmedAt,
      lastSeenAt: new Date(),
    })
    .where(eq(devices.id, device.id))
    .returning({
      id: devices.id,
      name: devices.name,
      pairingCode: devices.pairingCode,
      companionName: devices.companionName,
      claimedAt: devices.claimedAt,
      confirmedAt: devices.confirmedAt,
    });

  return c.json({
    device: updated,
    pairingStatus: "confirmed" as const,
    confirmed: true,
    paired: true,
  });
});

deviceRoutes.post("/:id/token", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ apiKey?: string }>();
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    throw new HTTPException(400, { message: "apiKey is required" });
  }

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found" });
  }

  if (
    device.ownerTokenHash &&
    (await verifySecret(apiKey, device.ownerTokenHash))
  ) {
    const token = await signOwnerToken(device.id);
    return c.json({ token, typ: "owner" as const });
  }

  if (
    device.deviceSecretHash &&
    (await verifySecret(apiKey, device.deviceSecretHash))
  ) {
    const token = await signDeviceToken(device.id);
    return c.json({ token, typ: "device" as const });
  }

  throw new HTTPException(401, { message: "Invalid apiKey" });
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

  if (!canAccessDevice(auth, device)) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }

  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, device.id));

  const status = pairingStatus(device);

  return c.json({
    deviceId: device.id,
    name: device.name,
    companionName: device.companionName,
    config: device.config,
    paired: status !== "unpaired",
    confirmed: status === "confirmed",
    pairingStatus: status,
  });
});

deviceRoutes.delete("/:id/claim", requireAuth, async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found" });
  }

  if (!canAccessDevice(auth, device)) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }

  // Purge device (+ cascaded integrations) on unpair.
  await db.delete(devices).where(eq(devices.id, device.id));

  return c.json({
    deleted: true,
    deviceId: id,
    paired: false,
    confirmed: false,
    pairingStatus: "unpaired" as const,
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

  if (!canAccessDevice(auth, device)) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }

  // Companion may only write config after the host confirms pairing.
  if (auth.typ === "owner" && !isDeviceConfirmed(device)) {
    throw new HTTPException(409, {
      message: "Waiting for display to confirm pairing",
    });
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
