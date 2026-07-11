import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { MapLibreBackground } from "./MapLibreBackground";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";

type MapBackgroundProps = {
  className?: string;
};

/**
 * Navigation map (MapLibre dark basemap).
 * Google Maps remains available later for branded cloud styles once the key is stable.
 */
export function MapBackground({ className }: MapBackgroundProps) {
  const mode = useVehicleStore((s) => s.mode);
  const position = useVehicleStore((s) => s.position);
  const route = useVehicleStore((s) => s.route);
  const destination = useVehicleStore((s) => s.destination);
  const usingGps = useVehicleStore((s) => s.usingGps);
  const locationSource = useVehicleStore((s) => s.locationSource);
  const navigating = useVehicleStore((s) => s.navigating);
  const [following, setFollowing] = useState(true);

  // Resume follow when navigation starts so the camera locks to the cursor again.
  useEffect(() => {
    if (navigating) setFollowing(true);
  }, [navigating]);

  const dimmed = !navigating && mode !== "drive";
  const hidden = mode === "connecting";

  return (
    <div
      className={cn(
        "absolute inset-0 z-0 transition-all duration-700 ease-out",
        hidden
          ? "scale-100 opacity-0"
          : dimmed
            ? "scale-[1.02] opacity-40"
            : "scale-100 opacity-100",
        className,
      )}
      aria-hidden={mode === "connecting"}
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
        onUserInteract={() => setFollowing(false)}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-black transition-opacity duration-700",
          dimmed ? "opacity-60" : "opacity-0",
        )}
      />
      {!hidden && !following ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[7.5rem] safe-bottom">
          <button
            type="button"
            onClick={() => setFollowing(true)}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/20 px-4 py-2.5 text-sm font-medium text-sky-100 backdrop-blur transition hover:bg-sky-500/30"
          >
            <Crosshair className="h-4 w-4" />
            Recenter
          </button>
        </div>
      ) : null}
    </div>
  );
}
