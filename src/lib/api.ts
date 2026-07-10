/**
 * Public API base for browser clients.
 * Prefer same-origin (Vite proxies /devices, /geo, …) so Cloudflare tunnel HTTPS works.
 */
export function apiBase(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

/** Absolute origin the companion app should call (embedded in pairing QR). */
export function publicApiOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const { protocol, hostname, origin } = window.location;
    // Localhost in Electrobun/desktop isn't reachable from a phone — fall back to env.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const env = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
      if (env && !env.includes("localhost") && !env.includes("127.0.0.1")) {
        return env;
      }
      // Still useful for same-machine testing; phone must use LAN IP manually.
      return origin;
    }
    // Tunnel / LAN: Vite proxies API on the same origin.
    if (protocol === "https:" || protocol === "http:") {
      return origin;
    }
  }
  return (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export type RegisterDeviceResponse = {
  device: {
    id: string;
    name: string;
    pairingCode: string;
    config: Record<string, unknown>;
    createdAt: string;
  };
  pairingCode: string;
  token: string;
  /** Host API key — same value as deviceSecret; store on the display. */
  apiKey: string;
  deviceSecret: string;
};

/** Payload encoded in the setup QR for the companion app. */
export type PairingQrPayload = {
  v: 1;
  api: string;
  code: string;
  deviceId: string;
};

export function buildPairingQrPayload(
  pairingCode: string,
  deviceId: string,
): PairingQrPayload {
  return {
    v: 1,
    api: publicApiOrigin(),
    code: pairingCode,
    deviceId,
  };
}

export function encodePairingQr(payload: PairingQrPayload): string {
  return JSON.stringify(payload);
}

export async function registerDevice(
  name = "Porkauto Display",
): Promise<RegisterDeviceResponse> {
  const res = await fetch(`${apiBase()}/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Device registration failed (${res.status})`);
  }

  return (await res.json()) as RegisterDeviceResponse;
}

export type DeviceStatus = {
  deviceId: string;
  name: string;
  config: Record<string, unknown>;
  paired: boolean;
  confirmed: boolean;
  pairingStatus: "unpaired" | "pending" | "confirmed";
};

export async function fetchDeviceConfig(
  deviceId: string,
  token: string,
): Promise<DeviceStatus> {
  const res = await fetch(`${apiBase()}/devices/${deviceId}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load config (${res.status})`);
  }

  return (await res.json()) as DeviceStatus;
}

export async function confirmDevicePairing(
  deviceId: string,
  token: string,
): Promise<DeviceStatus> {
  const res = await fetch(`${apiBase()}/devices/${deviceId}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to confirm pairing (${res.status})`);
  }

  const data = (await res.json()) as {
    device: { id: string; name: string };
    confirmed: boolean;
    paired: boolean;
    pairingStatus: "confirmed";
  };

  return {
    deviceId: data.device.id,
    name: data.device.name,
    config: {},
    paired: true,
    confirmed: true,
    pairingStatus: "confirmed",
  };
}

export async function unpairDevice(
  deviceId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${apiBase()}/devices/${deviceId}/claim`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to unpair (${res.status})`);
  }
}
