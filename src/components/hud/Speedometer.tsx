import { cn } from "@/lib/utils";

type SpeedometerProps = {
  speedKmh: number;
  overLimit?: boolean;
  className?: string;
};

export function Speedometer({
  speedKmh,
  overLimit = false,
  className,
}: SpeedometerProps) {
  return (
    <div className={cn("flex flex-col items-end leading-none", className)}>
      <span
        className={cn(
          "text-[4.25rem] font-semibold tracking-[-0.04em] tabular-nums transition-colors duration-300 md:text-[4.75rem]",
          overLimit ? "text-red-400" : "text-white",
        )}
      >
        {Math.round(speedKmh)}
      </span>
      <span className="mt-1.5 text-[11px] font-medium tracking-[0.08em] text-zinc-500">
        km/h
      </span>
    </div>
  );
}
