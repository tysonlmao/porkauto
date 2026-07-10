import { haversineM } from "@/lib/navigationCamera";
import type { LatLng } from "@/store/types";
import { cn } from "@/lib/utils";

/** Within this distance, show "arriving at …" instead of "driving to …". */
const ARRIVING_WITHIN_M = 80;

type NavStatusProps = {
  destinationName: string;
  destinationLocation: LatLng;
  position: LatLng;
  etaTime?: string | null;
  remainingMinutes?: number | null;
  className?: string;
};

export function NavStatus({
  destinationName,
  destinationLocation,
  position,
  etaTime,
  remainingMinutes,
  className,
}: NavStatusProps) {
  const distanceM = haversineM(position, destinationLocation);
  const arriving = distanceM <= ARRIVING_WITHIN_M;

  return (
    <div className={cn("leading-[1.35]", className)}>
      <p
        className={cn(
          "text-[14px] font-medium",
          arriving ? "text-[#7CFF9A]" : "text-zinc-300",
        )}
      >
        {arriving ? "Arriving at" : "Driving to"}{" "}
        <span className="text-white">{destinationName}</span>
      </p>
      {!arriving && (etaTime || remainingMinutes != null) ? (
        <p className="mt-0.5 text-[12px] text-zinc-500">
          {etaTime ? `ETA ${etaTime}` : null}
          {etaTime && remainingMinutes != null ? " · " : null}
          {remainingMinutes != null
            ? `${remainingMinutes} min`
            : null}
        </p>
      ) : null}
    </div>
  );
}
