import { useEffect, useRef } from "react";
import { haversineM } from "@/lib/navigationCamera";
import { fetchSpeedLimit } from "@/lib/speedLimit";
import { useVehicleStore } from "@/store/vehicle";

const MOVE_THRESHOLD_M = 40;
const POLL_MS = 12_000;

/**
 * Poll OSM maxspeed near the vehicle when GPS is active.
 * Updates speedLimitKmh; clears when GPS is lost.
 */
export function useSpeedLimit(enabled: boolean) {
  const lastFetchAt = useRef(0);
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    async function refresh(force: boolean) {
      const state = useVehicleStore.getState();
      if (state.locationSource !== "gps") {
        if (state.speedLimitKmh != null && state.speedSource !== "indev") {
          state.setSpeedLimit(null);
        }
        return;
      }

      const { lat, lng } = state.position;
      const prev = lastFetchPos.current;
      const moved =
        !prev || haversineM(prev, { lat, lng }) >= MOVE_THRESHOLD_M;
      const stale = performance.now() - lastFetchAt.current >= POLL_MS;

      if (!force && !moved && !stale) return;
      if (inFlight.current) return;

      inFlight.current = true;
      try {
        const limit = await fetchSpeedLimit(lat, lng);
        const current = useVehicleStore.getState();
        // Don't clobber indev presets while cycling demos.
        if (current.speedSource === "indev") return;
        current.setSpeedLimit(limit);
        lastFetchAt.current = performance.now();
        lastFetchPos.current = { lat, lng };
      } catch {
        // Keep last known limit on transient Overpass failures.
      } finally {
        inFlight.current = false;
      }
    }

    void refresh(true);

    const unsub = useVehicleStore.subscribe((state, prev) => {
      if (
        state.position.lat !== prev.position.lat ||
        state.position.lng !== prev.position.lng ||
        state.locationSource !== prev.locationSource
      ) {
        void refresh(false);
      }
    });

    const interval = window.setInterval(() => {
      void refresh(false);
    }, POLL_MS);

    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [enabled]);
}
