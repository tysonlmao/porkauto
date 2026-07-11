import {
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  CornerDownLeft,
  CornerDownRight,
  Flag,
  Merge,
  RotateCw,
  CircleDot,
} from "lucide-react";
import { formatManeuverDistance } from "@/lib/navigationCamera";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type ManeuverBannerProps = {
  instruction: string;
  distanceM: number;
  type: string;
  modifier?: string;
  className?: string;
};

function maneuverIcon(type: string, modifier?: string): LucideIcon {
  if (type === "arrive") return Flag;
  if (type === "roundabout" || type === "rotary" || type.startsWith("exit round")) {
    return RotateCw;
  }
  if (type === "merge" || type === "on ramp" || type === "off ramp") {
    return Merge;
  }
  if (type === "fork" || type === "continue" || type === "new name" || type === "depart") {
    if (modifier === "left" || modifier === "slight left") return ArrowUpLeft;
    if (modifier === "right" || modifier === "slight right") return ArrowUpRight;
    return ArrowUp;
  }
  if (type === "end of road") {
    if (modifier?.includes("left")) return CornerDownLeft;
    if (modifier?.includes("right")) return CornerDownRight;
  }
  if (modifier === "left" || modifier === "sharp left") return ArrowLeft;
  if (modifier === "right" || modifier === "sharp right") return ArrowRight;
  if (modifier === "slight left") return ArrowUpLeft;
  if (modifier === "slight right") return ArrowUpRight;
  if (modifier === "uturn") return RotateCw;
  if (type === "turn") {
    if (modifier?.includes("left")) return ArrowLeft;
    if (modifier?.includes("right")) return ArrowRight;
  }
  return CircleDot;
}

export function ManeuverBanner({
  instruction,
  distanceM,
  type,
  modifier,
  className,
}: ManeuverBannerProps) {
  const Icon = maneuverIcon(type, modifier);
  const distanceLabel = formatManeuverDistance(distanceM);

  return (
    <div
      className={cn(
        "flex max-w-[min(22rem,78vw)] items-center gap-3 rounded-sm border border-white/12 bg-black/75 px-3.5 py-3 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-emerald-500/15 text-emerald-300">
        <Icon className="h-7 w-7" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="min-w-0 leading-[1.3]">
        <p className="text-[18px] font-semibold tabular-nums text-white">
          {type === "arrive" ? "Arriving" : `In ${distanceLabel}`}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-zinc-300">{instruction}</p>
      </div>
    </div>
  );
}
