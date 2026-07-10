import type { LatLngLiteral } from "@/components/map/mapStyles";

export type GeocodeResult = {
  name: string;
  location: LatLngLiteral;
};

export type RouteResult = {
  coordinates: LatLngLiteral[];
  durationSec: number;
  distanceM: number;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Same-origin API (Vite proxies /geo → :3001) so HTTPS tunnels work. */
function geoApiBase(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  // Prefer relative paths so Cloudflare tunnel → Vite → API works.
  if (typeof window !== "undefined") {
    return "";
  }
  return env ?? "http://localhost:3001";
}

/** Initial bearing from A → B in degrees (0 = north, clockwise). */
export function bearingBetween(a: LatLngLiteral, b: LatLngLiteral): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function formatEta(
  durationSec: number,
  now = new Date(),
): { etaTime: string; remainingMinutes: number } {
  const remainingMinutes = Math.max(1, Math.round(durationSec / 60));
  const arrival = new Date(now.getTime() + remainingMinutes * 60_000);
  const hh = arrival.getHours().toString().padStart(2, "0");
  const mm = arrival.getMinutes().toString().padStart(2, "0");
  return { etaTime: `${hh}:${mm}`, remainingMinutes };
}

export async function geocodePlaces(
  query: string,
  near?: { lat: number; lng: number } | null,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({ q });
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    params.set("nearLat", String(near.lat));
    params.set("nearLng", String(near.lng));
  }

  const url = `${geoApiBase()}/geo/search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocode failed (${res.status})`);
  }

  const data = (await res.json()) as {
    results?: GeocodeResult[];
    error?: string;
  };

  if (data.error) throw new Error(data.error);
  return data.results ?? [];
}

export async function fetchDrivingRoute(
  from: LatLngLiteral,
  to: LatLngLiteral,
): Promise<RouteResult> {
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLng: String(from.lng),
    toLat: String(to.lat),
    toLng: String(to.lng),
  });
  const url = `${geoApiBase()}/geo/route?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Routing failed (${res.status})`);
  }

  const data = (await res.json()) as RouteResult & { error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.coordinates?.length) {
    throw new Error("No driving route found");
  }

  return {
    distanceM: data.distanceM,
    durationSec: data.durationSec,
    coordinates: data.coordinates,
  };
}

/** Straight-line fallback if OSRM is unreachable. */
export function straightRoute(
  from: LatLngLiteral,
  to: LatLngLiteral,
): RouteResult {
  const distanceM =
    6371000 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(toRad((to.lat - from.lat) / 2)) ** 2 +
          Math.cos(toRad(from.lat)) *
            Math.cos(toRad(to.lat)) *
            Math.sin(toRad((to.lng - from.lng) / 2)) ** 2,
      ),
    );
  const durationSec = (distanceM / 1000 / 40) * 3600;
  return {
    coordinates: [from, to],
    distanceM,
    durationSec,
  };
}
