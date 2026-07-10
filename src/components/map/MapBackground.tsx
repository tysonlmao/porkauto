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
  const navigating = useVehicleStore((s) => s.navigating);

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
        navigating={navigating}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-black transition-opacity duration-700",
          dimmed ? "opacity-60" : "opacity-0",
        )}
      />
    </div>
  );
}
