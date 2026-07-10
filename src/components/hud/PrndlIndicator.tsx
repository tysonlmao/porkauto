import { GEARS, type Gear } from "@/store/types";
import { cn } from "@/lib/utils";

type PrndlIndicatorProps = {
  gear: Gear;
  className?: string;
};

export function PrndlIndicator({ gear, className }: PrndlIndicatorProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-[0.85rem] text-[13px] font-medium tracking-[0.12em]",
        className,
      )}
      aria-label={`Gear ${gear}`}
    >
      {GEARS.map((g) => (
        <span
          key={g}
          className={cn(
            "transition-colors duration-300",
            g === gear
              ? "font-semibold text-white"
              : "font-normal text-zinc-600",
          )}
        >
          {g}
        </span>
      ))}
    </div>
  );
}
