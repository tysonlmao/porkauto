import type { LatLng } from "@/store/types";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function closestRouteIndex(position: LatLng, coords: LatLng[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const p = coords[i]!;
    const d = haversineM(position, p);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export type NextTurn = {
  point: LatLng;
  distanceM: number;
  index: number;
};

/**
 * Look ahead along the route for the next significant heading change (corner).
 */
export function findNextTurn(
  position: LatLng,
  coords: LatLng[],
  turnAngleDeg = 30,
): NextTurn | null {
  if (coords.length < 3) {
    const end = coords[coords.length - 1];
    if (!end) return null;
    return {
      point: end,
      distanceM: haversineM(position, end),
      index: coords.length - 1,
    };
  }

  const start = closestRouteIndex(position, coords);
  let along = 0;

  for (let i = start; i < coords.length - 2; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const c = coords[i + 2]!;
    along += haversineM(i === start ? position : a, b);

    const turn = angleDelta(bearing(a, b), bearing(b, c));
    if (turn >= turnAngleDeg) {
      return { point: b, distanceM: along, index: i + 1 };
    }
  }

  const end = coords[coords.length - 1]!;
  let remaining = 0;
  let prev = position;
  for (let i = start; i < coords.length; i++) {
    remaining += haversineM(prev, coords[i]!);
    prev = coords[i]!;
  }
  return { point: end, distanceM: remaining, index: coords.length - 1 };
}

/** Birds-eye zoom: closer to a turn → tighter zoom. */
export function birdsEyeZoomForTurnDistance(distanceM: number | null): number {
  if (distanceM == null) return 15;
  if (distanceM < 35) return 18;
  if (distanceM < 70) return 17.3;
  if (distanceM < 140) return 16.5;
  if (distanceM < 280) return 15.7;
  if (distanceM < 550) return 14.9;
  if (distanceM < 1100) return 14.1;
  return 13.3;
}
