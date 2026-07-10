import { useEffect, useRef } from "react";
import {
  getDeviceLocationFast,
  shouldUseIpLocationFallback,
  watchDeviceLocation,
  LocationError,
  type DeviceLocation,
  type LocationSource,
} from "@/lib/geolocation";
import { useVehicleStore } from "@/store/vehicle";

function applyLocation(loc: DeviceLocation) {
  const state = useVehicleStore.getState();
  // Never downgrade a GPS fix back to IP.
  if (state.locationSource === "gps" && loc.source === "ip") return;
  // GPS-capable devices must not accept IP at all.
  if (loc.source === "ip" && !shouldUseIpLocationFallback()) return;

  state.setPosition({ lat: loc.lat, lng: loc.lng });
  // Course-over-ground only when IMU compass isn't already driving the map.
  if (loc.heading != null) {
    state.setHeadingFromSensor(loc.heading, "gps");
  }
  // Only publish GPS speed when the receiver actually reported one.
  // Missing speed leaves the accelerometer estimator in charge.
  if (loc.speedMps != null && Number.isFinite(loc.speedMps) && loc.speedMps >= 0) {
    state.setSpeedFromSensor(loc.speedMps * 3.6, "gps");
  }
  state.setLocationStatus({
    locating: false,
    error: null,
    usingGps: true,
    locationSource: loc.source,
  });
}

/**
 * Soft-start location after setup.
 * Uses GPS whenever the browser can provide it; IP is only an interim/fallback
 * so the car cursor still appears quickly on Electrobun/desktop.
 */
export function useDeviceLocation(enabled: boolean) {
  const setLocationStatus = useVehicleStore((s) => s.setLocationStatus);
  const rerouteTimer = useRef<number | null>(null);
  const clearErrorTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stopWatch: (() => void) | undefined;

    setLocationStatus({ locating: true, error: null });

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

      // Always watch — upgrades IP → GPS when the platform eventually provides it.
      stopWatch = watchDeviceLocation(
        (loc) => {
          applyLocation(loc);

          const dest = useVehicleStore.getState().destination;
          if (!dest) return;

          if (rerouteTimer.current != null) {
            window.clearTimeout(rerouteTimer.current);
          }
          rerouteTimer.current = window.setTimeout(() => {
            void useVehicleStore.getState().setDestination(dest);
          }, 12_000);
        },
        (err) => {
          if (err.code === "timeout") return;
          const { usingGps, locationSource } = useVehicleStore.getState();
          // Keep an existing fix (IP or GPS); only surface hard denials.
          if (usingGps && err.code !== "denied") return;
          setLocationStatus({
            locating: false,
            error: err.message,
            usingGps,
            locationSource: locationSource as LocationSource | null,
          });
        },
      );
    })();

    return () => {
      cancelled = true;
      stopWatch?.();
      if (rerouteTimer.current != null) {
        window.clearTimeout(rerouteTimer.current);
      }
      if (clearErrorTimer.current != null) {
        window.clearTimeout(clearErrorTimer.current);
      }
    };
  }, [enabled, setLocationStatus]);
}
