import type { LatLng } from "@/store/types";
import { haversineM } from "@/lib/navigationCamera";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export type FilteredPosition = LatLng & {
  accuracyM: number | null;
};

/**
 * Accuracy-weighted EMA + short-gap dead reckoning + optional soft route snap.
 */
export class PositionFilter {
  private lat: number | null = null;
  private lng: number | null = null;
  private lastGpsAt = 0;
  private lastTickAt = 0;

  reset(): void {
    this.lat = null;
    this.lng = null;
    this.lastGpsAt = 0;
    this.lastTickAt = 0;
  }

  /** Ingest a GPS/IP fix. */
  updateGps(
    fix: LatLng,
    accuracyM: number | null,
    now = performance.now(),
  ): FilteredPosition {
    if (this.lat == null || this.lng == null) {
      this.lat = fix.lat;
      this.lng = fix.lng;
      this.lastGpsAt = now;
      this.lastTickAt = now;
      return { lat: fix.lat, lng: fix.lng, accuracyM };
    }

    const acc = accuracyM != null && accuracyM > 0 ? accuracyM : 25;
    // Better accuracy → higher weight on the new sample.
    const alpha = Math.min(0.85, Math.max(0.15, 12 / (acc + 8)));
    this.lat = this.lat * (1 - alpha) + fix.lat * alpha;
    this.lng = this.lng * (1 - alpha) + fix.lng * alpha;
    this.lastGpsAt = now;
    this.lastTickAt = now;
    return { lat: this.lat, lng: this.lng, accuracyM };
  }

  /**
   * Advance position between GPS fixes using heading + speed.
   * Caps at ~2.5 s of dead reckoning.
   */
  tick(
    headingDeg: number,
    speedMps: number,
    now = performance.now(),
  ): FilteredPosition | null {
    if (this.lat == null || this.lng == null) return null;
    if (speedMps < 0.3) {
      this.lastTickAt = now;
      return { lat: this.lat, lng: this.lng, accuracyM: null };
    }
    if (now - this.lastGpsAt > 2_500) {
      this.lastTickAt = now;
      return { lat: this.lat, lng: this.lng, accuracyM: null };
    }

    const dt = Math.min(0.25, Math.max(0, (now - this.lastTickAt) / 1000));
    this.lastTickAt = now;
    if (dt <= 0) return { lat: this.lat, lng: this.lng, accuracyM: null };

    const dist = speedMps * dt;
    const brng = toRad(headingDeg);
    const lat1 = toRad(this.lat);
    const lng1 = toRad(this.lng);
    const R = 6_371_000;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dist / R) +
        Math.cos(lat1) * Math.sin(dist / R) * Math.cos(brng),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(dist / R) * Math.cos(lat1),
        Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2),
      );

    this.lat = toDeg(lat2);
    this.lng = ((toDeg(lng2) + 540) % 360) - 180;
    return { lat: this.lat, lng: this.lng, accuracyM: null };
  }

  /** Soft-snap toward nearest route point within maxSnapM. */
  softSnapToRoute(
    route: LatLng[],
    maxSnapM = 25,
    blend = 0.35,
  ): FilteredPosition | null {
    if (this.lat == null || this.lng == null || route.length === 0) {
      return this.lat != null && this.lng != null
        ? { lat: this.lat, lng: this.lng, accuracyM: null }
        : null;
    }

    const here = { lat: this.lat, lng: this.lng };
    let best = route[0]!;
    let bestDist = Infinity;
    for (const p of route) {
      const d = haversineM(here, p);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }

    if (bestDist <= maxSnapM) {
      this.lat = this.lat * (1 - blend) + best.lat * blend;
      this.lng = this.lng * (1 - blend) + best.lng * blend;
    }

    return { lat: this.lat, lng: this.lng, accuracyM: null };
  }

  current(): FilteredPosition | null {
    if (this.lat == null || this.lng == null) return null;
    return { lat: this.lat, lng: this.lng, accuracyM: null };
  }
}
