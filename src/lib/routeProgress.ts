import type { LatLng } from "@/store/types";
import { haversineM } from "@/lib/navigationCamera";

export const OFF_ROUTE_THRESHOLD_M = 45;
/** Window of polyline points to search around the last known index. */
const WINDOW_BEFORE = 8;
const WINDOW_AFTER = 80;

export type RouteProgress = {
  index: number;
  distanceToRouteM: number;
  remainingDistanceM: number;
  offRoute: boolean;
};

/**
 * Nearest polyline index near `hintIndex` (incremental, not full O(n) scan).
 */
export function nearestRouteIndex(
  position: LatLng,
  coords: LatLng[],
  hintIndex = 0,
): { index: number; distanceM: number } {
  if (coords.length === 0) return { index: 0, distanceM: Infinity };
  const hint = Math.max(0, Math.min(hintIndex, coords.length - 1));
  const from = Math.max(0, hint - WINDOW_BEFORE);
  const to = Math.min(coords.length - 1, hint + WINDOW_AFTER);

  let best = hint;
  let bestDist = Infinity;
  for (let i = from; i <= to; i++) {
    const d = haversineM(position, coords[i]!);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }

  // If we appear far from the window, fall back to a full scan once.
  if (bestDist > OFF_ROUTE_THRESHOLD_M * 2) {
    for (let i = 0; i < coords.length; i++) {
      const d = haversineM(position, coords[i]!);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
  }

  return { index: best, distanceM: bestDist };
}

/** Remaining path length from `index` to the end (plus distance to that vertex). */
export function remainingRouteDistanceM(
  position: LatLng,
  coords: LatLng[],
  index: number,
): number {
  if (coords.length === 0) return 0;
  const i = Math.max(0, Math.min(index, coords.length - 1));
  let remaining = haversineM(position, coords[i]!);
  for (let j = i; j < coords.length - 1; j++) {
    remaining += haversineM(coords[j]!, coords[j + 1]!);
  }
  return remaining;
}

export function computeRouteProgress(
  position: LatLng,
  coords: LatLng[],
  hintIndex = 0,
  offRouteThresholdM = OFF_ROUTE_THRESHOLD_M,
): RouteProgress {
  const { index, distanceM } = nearestRouteIndex(position, coords, hintIndex);
  return {
    index,
    distanceToRouteM: distanceM,
    remainingDistanceM: remainingRouteDistanceM(position, coords, index),
    offRoute: distanceM > offRouteThresholdM,
  };
}

/** Snap target: blend toward the nearest on-route point when close enough. */
export function snapTargetOnRoute(
  position: LatLng,
  coords: LatLng[],
  hintIndex = 0,
  maxSnapM = 25,
): { point: LatLng; index: number; distanceM: number } | null {
  const { index, distanceM } = nearestRouteIndex(position, coords, hintIndex);
  if (distanceM > maxSnapM) return null;
  return { point: coords[index]!, index, distanceM };
}
