import { deviceAuthHeaders } from "./deviceAuthHeaders";

/** Same-origin API (Vite proxies /geo → :3001). */
function geoApiBase(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return "";
  }
  return env ?? "http://localhost:3001";
}

export type SpeedLimitResult = {
  speedLimitKmh: number | null;
  fetchedAt: number;
};

/** Look up posted speed limit near a GPS point via Overpass (proxied). */
export async function fetchSpeedLimit(
  lat: number,
  lng: number,
): Promise<SpeedLimitResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  const url = `${geoApiBase()}/geo/speed-limit?${params.toString()}`;
  const res = await fetch(url, { headers: deviceAuthHeaders() });
  if (!res.ok) {
    throw new Error(`Speed limit lookup failed (${res.status})`);
  }
  const data = (await res.json()) as {
    speedLimitKmh?: number | null;
    fetchedAt?: number;
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  const limit = data.speedLimitKmh;
  return {
    speedLimitKmh:
      typeof limit === "number" && Number.isFinite(limit) ? limit : null,
    fetchedAt:
      typeof data.fetchedAt === "number" ? data.fetchedAt : Date.now(),
  };
}
