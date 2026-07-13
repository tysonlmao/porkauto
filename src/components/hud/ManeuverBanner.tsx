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
import {
  formatManeuverDistance,
  streetLabelFromInstruction,
} from "@/lib/navigationCamera";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ResolvedAppearance } from "@/lib/displayTheme";

type ManeuverInfo = {
  instruction: string;
  distanceM: number;
  type: string;
  modifier?: string;
};

type ManeuverBannerProps = {
  instruction: string;
  distanceM: number;
  type: string;
  modifier?: string;
  /** Upcoming turn after the current one (Tesla “then” row). */
  thenManeuver?: ManeuverInfo | null;
  appearance?: ResolvedAppearance;
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

/**
 * Tesla-inspired guidance card: large distance + turn icon, street name,
 * optional then-turn row. Stays centered by the parent.
 */
export function ManeuverBanner({
  instruction,
  distanceM,
  type,
  modifier,
  thenManeuver,
  appearance = "dark",
  className,
}: ManeuverBannerProps) {
  const Icon = maneuverIcon(type, modifier);
  const distanceLabel = formatManeuverDistance(distanceM);
  const street = streetLabelFromInstruction(instruction);
  const light = appearance === "light";
  const ThenIcon = thenManeuver
    ? maneuverIcon(thenManeuver.type, thenManeuver.modifier)
    : null;
  const thenStreet = thenManeuver
    ? streetLabelFromInstruction(thenManeuver.instruction)
    : null;

  return (
    <div
      className={cn(
        "w-[min(22rem,86vw)] overflow-hidden rounded-2xl shadow-[0_8px_28px_rgba(0,0,0,0.18)]",
        light
          ? "border border-black/[0.06] bg-white/92 text-zinc-900 backdrop-blur-xl"
          : "border border-white/10 bg-[#1a1c22]/92 text-zinc-50 backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-start gap-3.5 px-4 pb-3.5 pt-4">
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
            light ? "bg-zinc-900 text-white" : "bg-white text-zinc-900",
          )}
        >
          <Icon className="h-8 w-8" strokeWidth={2.5} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5 leading-tight">
          <p
            className={cn(
              "text-[28px] font-semibold tracking-tight tabular-nums",
              light ? "text-zinc-900" : "text-white",
            )}
          >
            {type === "arrive" ? "Arriving" : distanceLabel}
          </p>
          <p
            className={cn(
              "mt-1 truncate text-[16px] font-medium",
              light ? "text-zinc-700" : "text-zinc-200",
            )}
          >
            {street}
          </p>
        </div>
      </div>

      {thenManeuver && ThenIcon && thenStreet ? (
        <div
          className={cn(
            "flex items-center gap-2.5 border-t px-4 py-2.5",
            light ? "border-zinc-200/90" : "border-white/10",
          )}
        >
          <ThenIcon
            className={cn(
              "h-5 w-5 shrink-0",
              light ? "text-zinc-800" : "text-zinc-100",
            )}
            strokeWidth={2.4}
            aria-hidden
          />
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] font-medium",
              light ? "text-zinc-700" : "text-zinc-200",
            )}
          >
            {thenStreet}
          </p>
          <p
            className={cn(
              "shrink-0 text-[13px] tabular-nums",
              light ? "text-zinc-500" : "text-zinc-400",
            )}
          >
            {formatManeuverDistance(thenManeuver.distanceM)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
