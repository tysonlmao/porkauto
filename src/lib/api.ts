const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
  deviceSecret: string;
};

export async function registerDevice(
  name = "Porkauto Display",
): Promise<RegisterDeviceResponse> {
  const res = await fetch(`${API_URL}/devices/register`, {
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

export async function fetchDeviceConfig(
  deviceId: string,
  token: string,
): Promise<{ deviceId: string; config: Record<string, unknown>; paired: boolean }> {
  const res = await fetch(`${API_URL}/devices/${deviceId}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load config (${res.status})`);
  }

  return (await res.json()) as {
    deviceId: string;
    config: Record<string, unknown>;
    paired: boolean;
  };
}

export { API_URL };
