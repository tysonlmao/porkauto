import {
  deviceLikelyHasGps,
  type DeviceLocation,
} from "@/lib/geolocation";
import {
  motionPermissionRequiresUserGesture,
  requestMotionPermissions,
  type MotionPermission,
} from "@/lib/deviceMotion";
import { useVehicleStore } from "@/store/vehicle";

export type DeviceAccessResult = {
  motion: MotionPermission;
  locationOk: boolean;
  locationError: string | null;
};

function applyLoc(loc: DeviceLocation) {
  const state = useVehicleStore.getState();
  if (state.locationSource === "gps" && loc.source === "ip") return;
  if (loc.source === "ip" && deviceLikelyHasGps()) return;

  state.setPosition({ lat: loc.lat, lng: loc.lng });
  if (loc.heading != null) {
    state.setHeadingFromSensor(loc.heading, "gps");
  }
  if (loc.speedMps != null && Number.isFinite(loc.speedMps) && loc.speedMps >= 0) {
    state.setSpeedFromSensor(loc.speedMps * 3.6, "gps");
  }
  state.setLocationStatus({
    locating: loc.source !== "gps",
    error: null,
    usingGps: true,
    locationSource: loc.source,
  });
}

function readGeoPosition(pos: GeolocationPosition): DeviceLocation {
  const { latitude, longitude, heading, speed, accuracy } = pos.coords;
  return {
    lat: latitude,
    lng: longitude,
    heading:
      typeof heading === "number" && Number.isFinite(heading) ? heading : null,
    speedMps:
      typeof speed === "number" && Number.isFinite(speed) ? speed : null,
    accuracyM: accuracy,
    source: "gps",
  };
}

/**
 * Call ONLY from a click/tap handler (iOS Safari requirement).
 *
 * Critical: both `getCurrentPosition` and `requestPermission` must be invoked
 * synchronously in the gesture turn — before any `await`.
 */
export async function promptDeviceAccessFromUserGesture(): Promise<DeviceAccessResult> {
  const store = useVehicleStore.getState();
  store.setLocationStatus({ locating: true, error: null });
  store.setMotionStatus({ error: null });

  const insecure =
    typeof window !== "undefined" && window.isSecureContext === false;

  // --- Synchronously kick GPS (must stay in the user-gesture call stack) ---
  let locationPromise: Promise<{ ok: boolean; error: string | null }>;

  if (typeof navigator !== "undefined" && "geolocation" in navigator) {
    locationPromise = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = readGeoPosition(pos);
          applyLoc(loc);
          useVehicleStore.getState().setLocationStatus({
            locating: false,
            error: null,
            usingGps: true,
            locationSource: "gps",
          });
          resolve({ ok: true, error: null });
        },
        (err) => {
          let message = "Could not get current location";
                          if (err.code === err.PERMISSION_DENIED) {
            message = insecure
              ? "Safari blocks GPS on HTTP. Run `bun run dev:tunnel` and open the https://*.trycloudflare.com URL on this device."
              : "Location permission denied. Allow Location for Safari, then try again.";
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            message = "Location unavailable. Check Location Services are on.";
          } else if (err.code === err.TIMEOUT) {
            message = "Timed out waiting for GPS.";
          }
          useVehicleStore.getState().setLocationStatus({
            locating: false,
            error: message,
            usingGps: false,
            locationSource: null,
          });
          resolve({ ok: false, error: message });
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 25_000,
        },
      );
    });
  } else {
    const message = "Geolocation is not supported in this browser.";
    store.setLocationStatus({
      locating: false,
      error: message,
      usingGps: false,
      locationSource: null,
    });
    locationPromise = Promise.resolve({ ok: false, error: message });
  }

  // --- Synchronously kick motion permission (same gesture turn) ---
  let motionPromise: Promise<MotionPermission> = Promise.resolve("granted");
  if (motionPermissionRequiresUserGesture()) {
    motionPromise = requestMotionPermissions();
  }

  const motion = await motionPromise;

  const enableMotion = useVehicleStore.getState().enableMotionSensors;
  if (motion === "granted") {
    useVehicleStore.getState().setMotionStatus({
      available: true,
      error: null,
    });
    if (enableMotion) {
      await enableMotion();
    }
  } else if (motion === "denied") {
    // Non-blocking — GPS can still work without motion/compass.
    useVehicleStore.getState().setMotionStatus({
      available: false,
      error: insecure
        ? "Motion needs a secure page. Use `bun run dev:tunnel` on the iPad."
        : "Motion optional: enable Settings → Apps → Safari → Motion & Orientation for compass.",
    });
  }

  const location = await locationPromise;

  return {
    motion,
    locationOk: location.ok,
    locationError: location.error,
  };
}
