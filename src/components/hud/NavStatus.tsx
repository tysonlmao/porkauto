import { haversineM } from "@/lib/navigationCamera";
import type { LatLng } from "@/store/types";
import type { ResolvedAppearance } from "@/lib/displayTheme";
import { cn } from "@/lib/utils";

/** Within this distance, show "arriving at …" instead of "driving to …". */
const ARRIVING_WITHIN_M = 80;

type NavStatusProps = {
  destinationName: string;
  destinationLocation: LatLng;
  position: LatLng;
  etaTime?: string | null;
  remainingMinutes?: number | null;
  remainingDistanceM?: number | null;
  offRoute?: boolean;
  appearance?: ResolvedAppearance;
  className?: string;
};

function formatRemaining(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  }
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Compact trip line — destination + ETA / duration / distance. */
export function NavStatus({
  destinationName,
  destinationLocation,
  position,
  etaTime,
  remainingMinutes,
  remainingDistanceM,
  offRoute,
  appearance = "dark",
  className,
}: NavStatusProps) {
  const crowM = haversineM(position, destinationLocation);
  const pathM = remainingDistanceM ?? crowM;
  const arriving = pathM <= ARRIVING_WITHIN_M;
  const light = appearance === "light";

  return (
    <div className={cn("leading-[1.35]", className)}>
      <div className="flex items-center gap-2">
        <p
          className={cn(
            "text-[14px] font-medium",
            arriving
              ? light
                ? "text-emerald-600"
                : "text-[#7CFF9A]"
              : light
                ? "text-zinc-600"
                : "text-zinc-300",
          )}
        >
          {offRoute && !arriving
            ? "Rerouting…"
            : arriving
              ? "Arriving at"
              : "Driving to"}{" "}
          <span className={light ? "text-zinc-900" : "text-white"}>
            {destinationName}
          </span>
        </p>
      </div>
      {!arriving && (etaTime || remainingMinutes != null || pathM > 0) ? (
        <p
          className={cn(
            "mt-0.5 text-[12px]",
            light ? "text-zinc-500" : "text-zinc-500",
          )}
        >
          {etaTime ? `ETA ${etaTime}` : null}
          {etaTime && remainingMinutes != null ? " · " : null}
          {remainingMinutes != null ? `${remainingMinutes} min` : null}
          {(etaTime || remainingMinutes != null) && pathM > 0 ? " · " : null}
          {pathM > 0 ? formatRemaining(pathM) : null}
        </p>
      ) : null}
    </div>
  );
}
