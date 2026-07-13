import { useEffect, useRef } from "react";
import {
  getDeviceLocationFast,
  shouldUseIpLocationFallback,
  watchDeviceLocation,
  LocationError,
  type DeviceLocation,
  type LocationSource,
} from "@/lib/geolocation";
import { PositionFilter } from "@/lib/positionFilter";
import { computeRouteProgress } from "@/lib/routeProgress";
import { formatEta } from "@/lib/routing";
import { useVehicleStore } from "@/store/vehicle";

/**
 * Soft-start location after setup.
 * Uses GPS whenever the browser can provide it; IP is only an interim/fallback.
 * Filters position (EMA + short DR + windowed route snap). Reroutes only when
 * off-route (debounced), and refreshes live ETA from remaining distance.
 */
export function useDeviceLocation(enabled: boolean) {
  const setLocationStatus = useVehicleStore((s) => s.setLocationStatus);
  const rerouteTimer = useRef<number | null>(null);
  const clearErrorTimer = useRef<number | null>(null);
  const filterRef = useRef(new PositionFilter());
  const routeIndexRef = useRef(0);
  const lastLocRef = useRef<DeviceLocation | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stopWatch: (() => void) | undefined;
    let drTimer: number | null = null;

    filterRef.current.reset();
    routeIndexRef.current = 0;
    setLocationStatus({ locating: true, error: null });

    function updateNavProgress(lat: number, lng: number) {
      const state = useVehicleStore.getState();
      if (!state.navigating || !state.route?.coordinates?.length) return;

      const progress = computeRouteProgress(
        { lat, lng },
        state.route.coordinates,
        routeIndexRef.current,
      );
      routeIndexRef.current = progress.index;

      // Scale remaining time from original duration vs remaining distance.
      const totalM = Math.max(1, state.route.distanceM);
      const frac = Math.min(1, progress.remainingDistanceM / totalM);
      const remainingSec = Math.max(0, state.route.durationSec * frac);
      const { etaTime, remainingMinutes } = formatEta(remainingSec);

      const destName = state.destination?.name ?? state.nav?.destination ?? "";
      state.setNav({
        etaTime,
        remainingMinutes,
        destination: destName,
        remainingDistanceM: progress.remainingDistanceM,
        offRoute: progress.offRoute,
      });

      return progress;
    }

    function applyLocation(loc: DeviceLocation) {
      const state = useVehicleStore.getState();
      if (state.locationSource === "gps" && loc.source === "ip") return;
      if (loc.source === "ip" && !shouldUseIpLocationFallback()) return;

      lastLocRef.current = loc;
      const filtered = filterRef.current.updateGps(
        { lat: loc.lat, lng: loc.lng },
        loc.accuracyM ?? null,
      );

      let snapped = filtered;
      if (state.navigating && state.route?.coordinates?.length) {
        const soft = filterRef.current.softSnapToRoute(
          state.route.coordinates,
          25,
          0.35,
          routeIndexRef.current,
        );
        if (soft) snapped = soft;
      }

      state.setPosition({ lat: snapped.lat, lng: snapped.lng });
      const progress = updateNavProgress(snapped.lat, snapped.lng);

      if (loc.heading != null) {
        if (state.headingSource === "imu") {
          const speedKmh =
            loc.speedMps != null && Number.isFinite(loc.speedMps)
              ? loc.speedMps * 3.6
              : state.speedKmh;
          state.calibrateHeadingFromGpsCourse(loc.heading, speedKmh);
        } else {
          state.setHeadingFromSensor(loc.heading, "gps");
        }
      }

      if (
        loc.speedMps != null &&
        Number.isFinite(loc.speedMps) &&
        loc.speedMps >= 0
      ) {
        state.setSpeedFromSensor(loc.speedMps * 3.6, "gps");
      }

      state.setLocationStatus({
        locating: false,
        error: null,
        usingGps: true,
        locationSource: loc.source,
      });

      // Reroute only when off-route (not on every GPS tick).
      const dest = useVehicleStore.getState().destination;
      if (!dest || !progress?.offRoute) {
        if (!dest && rerouteTimer.current != null) {
          window.clearTimeout(rerouteTimer.current);
          rerouteTimer.current = null;
        }
        return;
      }

      if (rerouteTimer.current != null) return;
      const scheduledLat = dest.location.lat;
      const scheduledLng = dest.location.lng;
      rerouteTimer.current = window.setTimeout(() => {
        rerouteTimer.current = null;
        const current = useVehicleStore.getState().destination;
        if (
          !current ||
          current.location.lat !== scheduledLat ||
          current.location.lng !== scheduledLng
        ) {
          return;
        }
        const still = useVehicleStore.getState();
        if (!still.navigating || !still.nav?.offRoute) return;
        routeIndexRef.current = 0;
        void still.setDestination(current);
      }, 4_000);
    }

    function tickDeadReckon() {
      if (cancelled) return;
      const state = useVehicleStore.getState();
      if (state.locationSource !== "gps") return;

      const speedMps = state.speedKmh / 3.6;
      const advanced = filterRef.current.tick(state.position.heading, speedMps);
      if (!advanced) return;

      let next = advanced;
      if (state.navigating && state.route?.coordinates?.length) {
        const soft = filterRef.current.softSnapToRoute(
          state.route.coordinates,
          25,
          0.2,
          routeIndexRef.current,
        );
        if (soft) next = soft;
      }

      const cur = state.position;
      if (
        Math.abs(cur.lat - next.lat) > 1e-7 ||
        Math.abs(cur.lng - next.lng) > 1e-7
      ) {
        state.setPosition({ lat: next.lat, lng: next.lng });
        updateNavProgress(next.lat, next.lng);
      }
    }

    void (async () => {
      try {
        await getDeviceLocationFast((loc) => {
          if (cancelled) return;
          applyLocation(loc);
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof LocationError
            ? err.message
            : "Could not get current location";
        setLocationStatus({
          locating: false,
          error: message,
          usingGps: false,
          locationSource: null,
        });
        clearErrorTimer.current = window.setTimeout(() => {
          const current = useVehicleStore.getState().locationError;
          if (current === message) {
            setLocationStatus({ error: null });
          }
        }, 8_000);
      }

      if (cancelled) return;

      stopWatch = watchDeviceLocation(
        (loc) => {
          applyLocation(loc);
        },
        (err) => {
          if (err.code === "timeout") return;
          const { usingGps, locationSource } = useVehicleStore.getState();
          if (usingGps && err.code !== "denied") return;
          setLocationStatus({
            locating: false,
            error: err.message,
            usingGps,
            locationSource: locationSource as LocationSource | null,
          });
        },
      );

      drTimer = window.setInterval(tickDeadReckon, 100);
    })();

    return () => {
      cancelled = true;
      stopWatch?.();
      if (drTimer != null) window.clearInterval(drTimer);
      if (rerouteTimer.current != null) {
        window.clearTimeout(rerouteTimer.current);
      }
      if (clearErrorTimer.current != null) {
        window.clearTimeout(clearErrorTimer.current);
      }
    };
  }, [enabled, setLocationStatus]);
}
