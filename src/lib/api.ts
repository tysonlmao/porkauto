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

/** Typed HTTP failure so pollers can stop on auth errors. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function errorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/** Duck-typed — avoid `instanceof` (breaks across Vite HMR copies). */
export function isAuthError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === 401 || status === 403;
}

/** Stop polling: bad credentials or device purged. */
export function isFatalDeviceError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === 401 || status === 403 || status === 404;
}

/** Never re-hit the API with a credential that already got 401/403/404. */
const deadCredentials = new Set<string>();

function credentialKey(deviceId: string, credential: string): string {
  return `${deviceId}:${credential}`;
}

export function rememberDeviceAuthFailure(
  deviceId: string,
  credential: string,
): void {
  deadCredentials.add(credentialKey(deviceId, credential));
}

export function assertCredentialAlive(deviceId: string, credential: string): void {
  if (deadCredentials.has(credentialKey(deviceId, credential))) {
    throw new ApiError("Device credentials rejected (cached)", 401);
  }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new ApiError(body?.error ?? `${fallback} (${res.status})`, res.status);
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
    throw new ApiError(
      body?.error ?? `Device registration failed (${res.status})`,
      res.status,
    );
  }

  return (await res.json()) as RegisterDeviceResponse;
}

export type DeviceStatus = {
  deviceId: string;
  name: string;
  /** Friendly name of the phone/tablet that claimed this display. */
  companionName: string | null;
  config: Record<string, unknown>;
  paired: boolean;
  confirmed: boolean;
  pairingStatus: "unpaired" | "pending" | "confirmed";
};

export async function fetchDeviceConfig(
  deviceId: string,
  token: string,
): Promise<DeviceStatus> {
  assertCredentialAlive(deviceId, token);

  const res = await fetch(`${apiBase()}/devices/${deviceId}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      rememberDeviceAuthFailure(deviceId, token);
    }
    await throwApiError(res, "Failed to load config");
  }

  const data = (await res.json()) as DeviceStatus & {
    companionName?: string | null;
  };
  return {
    ...data,
    companionName: data.companionName?.trim() || null,
  };
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
    await throwApiError(res, "Failed to confirm pairing");
  }

  const data = (await res.json()) as {
    device: { id: string; name: string; companionName?: string | null };
    confirmed: boolean;
    paired: boolean;
    pairingStatus: "confirmed";
  };

  return {
    deviceId: data.device.id,
    name: data.device.name,
    companionName: data.device.companionName ?? null,
    config: {},
    paired: true,
    confirmed: true,
    pairingStatus: "confirmed",
  };
}

export async function patchDeviceConfig(
  deviceId: string,
  token: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertCredentialAlive(deviceId, token);

  const res = await fetch(`${apiBase()}/devices/${deviceId}/config`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ config }),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      rememberDeviceAuthFailure(deviceId, token);
    }
    await throwApiError(res, "Failed to save config");
  }

  const data = (await res.json()) as { config?: Record<string, unknown> };
  return data.config ?? config;
}

export async function unpairDevice(
  deviceId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${apiBase()}/devices/${deviceId}/claim`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // 404 = already purged — treat as success.
  if (res.status === 404) {
    rememberDeviceAuthFailure(deviceId, token);
    return;
  }

  if (!res.ok) {
    await throwApiError(res, "Failed to unpair");
  }

  rememberDeviceAuthFailure(deviceId, token);
}
