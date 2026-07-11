import { useEffect, useRef } from "react";
import { findNextTurn, haversineM } from "@/lib/navigationCamera";
import { fetchSpeedLimit } from "@/lib/speedLimit";
import { useVehicleStore } from "@/store/vehicle";

const MOVE_THRESHOLD_M = 40;
const POLL_MS = 12_000;
const STALE_CLEAR_MS = 90_000;
const TURN_NEAR_M = 80;
const HEADING_DELTA_FORCE = 35;

/**
 * Poll OSM maxspeed near the vehicle when GPS is active.
 * Clears limit after ~90 s without a successful fetch, or when GPS is lost.
 */
export function useSpeedLimit(enabled: boolean) {
  const lastFetchAt = useRef(0);
  const lastSuccessAt = useRef(0);
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastHeading = useRef<number | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    async function refresh(force: boolean) {
      const state = useVehicleStore.getState();
      if (state.locationSource !== "gps") {
        if (state.speedLimitKmh != null && state.speedSource !== "indev") {
          state.setSpeedLimit(null);
        }
        lastSuccessAt.current = 0;
        return;
      }

      // Expire stale limits when Overpass has been unreachable.
      if (
        state.speedLimitKmh != null &&
        state.speedSource !== "indev" &&
        lastSuccessAt.current > 0 &&
        performance.now() - lastSuccessAt.current >= STALE_CLEAR_MS
      ) {
        state.setSpeedLimit(null);
      }

      const { lat, lng, heading } = state.position;
      const prev = lastFetchPos.current;
      const moved =
        !prev || haversineM(prev, { lat, lng }) >= MOVE_THRESHOLD_M;
      const stale = performance.now() - lastFetchAt.current >= POLL_MS;

      const headingDelta =
        lastHeading.current == null
          ? 0
          : Math.abs(
              ((heading - lastHeading.current + 540) % 360) - 180,
            );
      const nearTurn =
        state.navigating &&
        state.route?.coordinates?.length &&
        (findNextTurn({ lat, lng }, state.route.coordinates)?.distanceM ??
          Infinity) < TURN_NEAR_M;

      const shouldForce =
        force ||
        nearTurn ||
        headingDelta >= HEADING_DELTA_FORCE;

      if (!shouldForce && !moved && !stale) return;
      if (inFlight.current) return;

      inFlight.current = true;
      try {
        const result = await fetchSpeedLimit(lat, lng);
        const current = useVehicleStore.getState();
        if (current.speedSource === "indev") return;
        current.setSpeedLimit(result.speedLimitKmh);
        lastFetchAt.current = performance.now();
        lastSuccessAt.current = performance.now();
        lastFetchPos.current = { lat, lng };
        lastHeading.current = heading;
      } catch {
        // Keep last known until STALE_CLEAR_MS elapses.
      } finally {
        inFlight.current = false;
      }
    }

    void refresh(true);

    const unsub = useVehicleStore.subscribe((state, prev) => {
      if (
        state.position.lat !== prev.position.lat ||
        state.position.lng !== prev.position.lng ||
        state.position.heading !== prev.position.heading ||
        state.locationSource !== prev.locationSource ||
        state.navigating !== prev.navigating
      ) {
        void refresh(false);
      }
    });

    const interval = window.setInterval(() => {
      void refresh(false);
    }, Math.min(POLL_MS, 5_000));

    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [enabled]);
}
