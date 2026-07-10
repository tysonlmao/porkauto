import { useClock } from "@/hooks/useClock";
import { cn } from "@/lib/utils";

type ClockProps = {
  variant: "hero" | "compact";
  className?: string;
};

export function Clock({ variant, className }: ClockProps) {
  const { time, dateLabel } = useClock();

  if (variant === "compact") {
    return (
      <p
        className={cn(
          "text-[15px] font-medium tracking-tight text-white/90",
          className,
        )}
      >
        <span className="font-semibold text-white">{time}</span>
        <span className="ml-1.5 font-normal text-zinc-500">{dateLabel}</span>
      </p>
    );
  }

  return (
    <div className={cn("text-center", className)}>
      <p className="text-[7.5rem] font-semibold leading-none tracking-[-0.04em] text-white tabular-nums md:text-[8.5rem]">
        {time}
      </p>
      <p className="mt-4 text-2xl font-normal tracking-wide text-zinc-500 md:text-3xl">
        {dateLabel}
      </p>
    </div>
  );
}
