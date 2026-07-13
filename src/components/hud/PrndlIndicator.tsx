import { useRef } from "react";
import { GEARS, type Gear } from "@/store/types";
import { useVehicleStore } from "@/store/vehicle";
import { resolveAppearance } from "@/lib/displayTheme";
import { devToolsEnabled } from "@/lib/devTools";
import { cn } from "@/lib/utils";

type PrndlIndicatorProps = {
  gear: Gear;
  className?: string;
};

const SWIPE_THRESHOLD_PX = 36;

export function PrndlIndicator({ gear, className }: PrndlIndicatorProps) {
  const setGear = useVehicleStore((s) => s.setGear);
  const displayTheme = useVehicleStore((s) => s.displayTheme);
  const light = resolveAppearance(displayTheme) === "light";
  const interactive = devToolsEnabled();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function shiftGear(delta: number) {
    const idx = GEARS.indexOf(gear);
    if (idx < 0) return;
    const next = GEARS[idx + delta];
    if (next) setGear(next);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (!interactive) return;
    const t = e.changedTouches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!interactive || !touchStart.current) return;
    const t = e.changedTouches[0];
    if (!t) {
      touchStart.current = null;
      return;
    }
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) return;

    if (absX >= absY) {
      shiftGear(dx > 0 ? 1 : -1);
    } else {
      shiftGear(dy > 0 ? 1 : -1);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-[0.85rem] text-[13px] font-medium tracking-[0.12em]",
        interactive &&
          "pointer-events-auto touch-manipulation select-none py-2",
        className,
      )}
      aria-label={`Gear ${gear}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {GEARS.map((g) => (
        <span
          key={g}
          className={cn(
            "transition-colors duration-300",
            g === gear
              ? cn("font-semibold", light ? "text-zinc-900" : "text-white")
              : cn("font-normal", light ? "text-zinc-400" : "text-zinc-600"),
          )}
        >
          {g}
        </span>
      ))}
    </div>
  );
}
