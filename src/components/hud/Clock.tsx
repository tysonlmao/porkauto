import { useClock } from "@/hooks/useClock";
import { resolveAppearance } from "@/lib/displayTheme";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";

type ClockProps = {
  variant: "hero" | "compact";
  className?: string;
};

export function Clock({ variant, className }: ClockProps) {
  const { time, dateLabel } = useClock();
  const displayTheme = useVehicleStore((s) => s.displayTheme);
  const light = resolveAppearance(displayTheme) === "light";

  if (variant === "compact") {
    return (
      <p
        className={cn(
          "text-[15px] font-medium tracking-tight",
          light ? "text-zinc-800" : "text-white/90",
          className,
        )}
      >
        <span
          className={cn(
            "font-semibold",
            light ? "text-zinc-900" : "text-white",
          )}
        >
          {time}
        </span>
        <span
          className={cn(
            "ml-1.5 font-normal",
            light ? "text-zinc-500" : "text-zinc-500",
          )}
        >
          {dateLabel}
        </span>
      </p>
    );
  }

  return (
    <div className={cn("text-center", className)}>
      <p
        className={cn(
          "text-[7.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums md:text-[8.5rem]",
          light ? "text-zinc-900" : "text-white",
        )}
      >
        {time}
      </p>
      <p
        className={cn(
          "mt-4 text-2xl font-normal tracking-wide md:text-3xl",
          light ? "text-zinc-500" : "text-zinc-500",
        )}
      >
        {dateLabel}
      </p>
    </div>
  );
}
