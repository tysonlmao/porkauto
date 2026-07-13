/**
 * Requires: bun run db:up && bun run db:migrate
 * Uses DATABASE_URL / JWT_SECRET from env (.env).
 * Skips when Postgres is unreachable so `bun run check` still works offline.
 */
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { app } from "../index";
import { db } from "../db/client";

async function postgresAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

const hasDb = await postgresAvailable();

async function registerDevice(name = "Test Display") {
  const res = await app.request("/devices/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBeGreaterThanOrEqual(200);
  expect(res.status).toBeLessThan(300);
  return (await res.json()) as {
    device: { id: string; pairingCode: string };
    pairingCode: string;
    apiKey: string;
    deviceSecret: string;
    token: string;
  };
}

describe.skipIf(!hasDb)("device pairing HTTP", () => {
  test("register returns pairing credentials", async () => {
    const data = await registerDevice();
    expect(data.device.id).toBeTruthy();
    expect(data.pairingCode.length).toBeGreaterThanOrEqual(6);
    expect(data.apiKey || data.deviceSecret).toBeTruthy();
    expect(data.token).toBeTruthy();
  });

  test("claim with bad code returns 404", async () => {
    const res = await app.request("/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: "ZZZZZZ" }),
    });
    expect(res.status).toBe(404);
  });

  test("claim → pending; second claim 409; confirm; config auth", async () => {
    const reg = await registerDevice();
    const deviceKey = reg.apiKey || reg.deviceSecret;

    const claim = await app.request("/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingCode: reg.pairingCode,
        name: "TestPhone",
      }),
    });
    expect(claim.status).toBe(200);
    const claimBody = (await claim.json()) as {
      apiKey: string;
      pairingStatus: string;
      confirmed: boolean;
    };
    expect(claimBody.pairingStatus).toBe("pending");
    expect(claimBody.confirmed).toBe(false);
    expect(claimBody.apiKey).toBeTruthy();

    const claimAgain = await app.request("/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: reg.pairingCode }),
    });
    expect(claimAgain.status).toBe(409);

    const unauthConfig = await app.request(
      `/devices/${reg.device.id}/config`,
    );
    expect(unauthConfig.status).toBe(401);

    const confirm = await app.request(`/devices/${reg.device.id}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deviceKey}` },
    });
    expect(confirm.status).toBe(200);
    const confirmBody = (await confirm.json()) as { pairingStatus: string };
    expect(confirmBody.pairingStatus).toBe("confirmed");

    const config = await app.request(`/devices/${reg.device.id}/config`, {
      headers: { Authorization: `Bearer ${deviceKey}` },
    });
    expect(config.status).toBe(200);
    const configBody = (await config.json()) as { pairingStatus: string };
    expect(configBody.pairingStatus).toBe("confirmed");

    const del = await app.request(`/devices/${reg.device.id}/claim`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deviceKey}` },
    });
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as { deleted: boolean };
    expect(delBody.deleted).toBe(true);
  });

  test("pending owner DELETE clears claim but keeps device", async () => {
    const reg = await registerDevice();
    const deviceKey = reg.apiKey || reg.deviceSecret;

    const claim = await app.request("/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: reg.pairingCode, name: "Phone" }),
    });
    expect(claim.status).toBe(200);
    const { apiKey: ownerKey } = (await claim.json()) as { apiKey: string };

    const del = await app.request(`/devices/${reg.device.id}/claim`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ownerKey}` },
    });
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as {
      deleted: boolean;
      cleared?: boolean;
      pairingStatus: string;
    };
    expect(delBody.deleted).toBe(false);
    expect(delBody.cleared).toBe(true);
    expect(delBody.pairingStatus).toBe("unpaired");

    const stillThere = await app.request(`/devices/${reg.device.id}/config`, {
      headers: { Authorization: `Bearer ${deviceKey}` },
    });
    expect(stillThere.status).toBe(200);
    const cfg = (await stillThere.json()) as { pairingStatus: string };
    expect(cfg.pairingStatus).toBe("unpaired");

    const ownerGone = await app.request(`/devices/${reg.device.id}/config`, {
      headers: { Authorization: `Bearer ${ownerKey}` },
    });
    expect(ownerGone.status).toBe(401);
  });

  test("pending device DELETE clears claim and keeps pairing code usable", async () => {
    const reg = await registerDevice();
    const deviceKey = reg.apiKey || reg.deviceSecret;

    const claim = await app.request("/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: reg.pairingCode }),
    });
    expect(claim.status).toBe(200);

    const del = await app.request(`/devices/${reg.device.id}/claim`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deviceKey}` },
    });
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as { deleted: boolean };
    expect(delBody.deleted).toBe(false);

    const reclaim = await app.request("/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode: reg.pairingCode, name: "Again" }),
    });
    expect(reclaim.status).toBe(200);
  });

  test("geo search requires auth; approx does not", async () => {
    const unauth = await app.request("/geo/search?q=brisbane");
    expect(unauth.status).toBe(401);

    const approx = await app.request("/geo/approx");
    expect(approx.status).not.toBe(401);

    const reg = await registerDevice();
    const deviceKey = reg.apiKey || reg.deviceSecret;
    const authSearch = await app.request("/geo/search?q=br", {
      headers: {
        Authorization: `Bearer ${deviceKey}`,
        "X-Device-Id": reg.device.id,
      },
    });
    expect(authSearch.status).not.toBe(401);
  });
});

describe("geo auth without DB", () => {
  test("unauthenticated geo search returns 401", async () => {
    const unauth = await app.request("/geo/search?q=brisbane");
    expect(unauth.status).toBe(401);
  });
});
