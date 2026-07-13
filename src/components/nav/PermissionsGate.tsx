import { useState, type MouseEvent } from "react";
import { LocateFixed } from "lucide-react";
import {
  deviceLikelyHasGps,
  isElectrobunRuntime,
} from "@/lib/geolocation";
import { motionPermissionRequiresUserGesture } from "@/lib/deviceMotion";
import { promptDeviceAccessFromUserGesture } from "@/lib/promptDeviceAccess";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";
import { MgLoader } from "@/components/graphics";

/**
 * Gate for Safari GPS + motion. Motion is required for map heading + IMU speed.
 */
export function PermissionsGate() {
  const motionNeedsGesture = useVehicleStore((s) => s.motionNeedsGesture);
  const motionAvailable = useVehicleStore((s) => s.motionAvailable);
  const usingGps = useVehicleStore((s) => s.usingGps);
  const locationSource = useVehicleStore((s) => s.locationSource);
  const locationError = useVehicleStore((s) => s.locationError);
  const motionError = useVehicleStore((s) => s.motionError);
  const locating = useVehicleStore((s) => s.locating);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const electrobun = isElectrobunRuntime();
  const gpsDevice = deviceLikelyHasGps();
  const needsSafariGesture = motionPermissionRequiresUserGesture();
  const insecure =
    typeof window !== "undefined" && window.isSecureContext === false;

  const hasDeviceGps = locationSource === "gps";
  // On iPad, need both GPS and motion for heading/speed from sensors.
  const sensorsReady = gpsDevice
    ? hasDeviceGps && (motionAvailable || !needsSafariGesture)
    : usingGps || motionAvailable;

  if (dismissed && sensorsReady) return null;

  const showGate = electrobun
    ? !dismissed && Boolean(locationError) && !usingGps && !locating
    : !dismissed &&
      (insecure ||
        Boolean(locationError) ||
        (gpsDevice && !hasDeviceGps && !locating) ||
        (needsSafariGesture && !motionAvailable) ||
        (motionNeedsGesture && !motionAvailable) ||
        (!sensorsReady && needsSafariGesture));

  if (!showGate) return null;

  function handleAllow(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (insecure) return;
    setBusy(true);

    void promptDeviceAccessFromUserGesture()
      .then((result) => {
        const state = useVehicleStore.getState();
        if (
          (result.locationOk || state.locationSource === "gps") &&
          (result.motion === "granted" ||
            result.motion === "unsupported" ||
            state.motionAvailable)
        ) {
          setDismissed(true);
        }
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/5">
          <LocateFixed className="h-6 w-6 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {electrobun
            ? "Location needed"
            : insecure
              ? "Need a secure URL"
              : "Allow location & motion"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {insecure
            ? "Safari blocks sensors on HTTP. Run bun run dev:tunnel and open the https://*.trycloudflare.com link."
            : "Tap Allow access so Safari can use GPS (position) and Motion (map heading + speed)."}
        </p>

        {insecure && (
          <p className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-left text-xs leading-relaxed text-sky-200">
            <span className="font-mono text-[11px]">bun run dev:tunnel</span>
          </p>
        )}

        {(locationError || motionError) && !insecure && (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs leading-relaxed text-amber-300">
            {locationError || motionError}
          </p>
        )}

        <button
          type="button"
          onClick={handleAllow}
          disabled={busy || insecure}
          className={cn(
            "mt-8 w-full rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-black transition hover:bg-zinc-200",
            (busy || insecure) && "opacity-70",
          )}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <MgLoader size={16} variant="spin" className="text-black" />
              Waiting for Safari…
            </span>
          ) : insecure ? (
            "Waiting for HTTPS tunnel…"
          ) : (
            "Allow access"
          )}
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-600 transition hover:text-zinc-400"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
