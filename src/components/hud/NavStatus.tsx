import { haversineM } from "@/lib/navigationCamera";
import type { LatLng } from "@/store/types";
import { cn } from "@/lib/utils";

/** Within this distance, show "arriving at …" instead of "driving to …". */
const ARRIVING_WITHIN_M = 80;

type NavStatusProps = {
  destinationName: string;
  destinationLocation: LatLng;
  position: LatLng;
  className?: string;
};

export function NavStatus({
  destinationName,
  destinationLocation,
  position,
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
    </div>
  );
}
