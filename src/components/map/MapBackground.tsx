import { useEffect, useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { MapLibreBackground } from "./MapLibreBackground";
import { resolveAppearance } from "@/lib/displayTheme";
import { hudBackdropColor } from "@/lib/mapTheme";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";

type MapBackgroundProps = {
  className?: string;
};

/**
 * Navigation map (MapLibre). Appearance follows displayTheme (incl. daylight).
 *
 * Park uses a light opacity mute only — never a solid zinc/black wash. That wash
 * used to fake light/dark in Park while N/D showed the (often unthemed) basemap.
 */
export function MapBackground({ className }: MapBackgroundProps) {
  const mode = useVehicleStore((s) => s.mode);
  const position = useVehicleStore((s) => s.position);
  const route = useVehicleStore((s) => s.route);
  const destination = useVehicleStore((s) => s.destination);
  const usingGps = useVehicleStore((s) => s.usingGps);
  const locationSource = useVehicleStore((s) => s.locationSource);
  const navigating = useVehicleStore((s) => s.navigating);
  const displayTheme = useVehicleStore((s) => s.displayTheme);
  const [following, setFollowing] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (displayTheme !== "daylight" && displayTheme !== "system") return;
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [displayTheme]);

  const appearance = useMemo(
    () => resolveAppearance(displayTheme, new Date(nowTick)),
    [displayTheme, nowTick],
  );

  useEffect(() => {
    if (navigating) setFollowing(true);
  }, [navigating]);

  useEffect(() => {
    if (mode === "drive") setFollowing(true);
  }, [mode]);

  const dimmed = !navigating && mode !== "drive";
  const backdrop = hudBackdropColor(appearance);

  return (
    <div
      className={cn(
        "absolute inset-0 z-0 transition-[opacity,transform] duration-700 ease-out",
        dimmed ? "scale-[1.02] opacity-55" : "scale-100 opacity-100",
        className,
      )}
      style={{ backgroundColor: backdrop }}
    >
      <MapLibreBackground
        mode={mode}
        position={position}
        route={route}
        destination={destination}
        hasLiveLocation={usingGps}
        pinTight={locationSource === "gps"}
        navigating={navigating}
        following={following}
        appearance={appearance}
        onUserInteract={() => setFollowing(false)}
      />
      {!following ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[7.5rem] safe-bottom">
          <button
            type="button"
            onClick={() => setFollowing(true)}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium backdrop-blur transition",
              appearance === "light"
                ? "border-sky-600/35 bg-sky-600/15 text-sky-900 hover:bg-sky-600/25"
                : "border-sky-400/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30",
            )}
          >
            <Crosshair className="h-4 w-4" />
            Recenter
          </button>
        </div>
      ) : null}
    </div>
  );
}
