import { cn } from "@/lib/utils";

type SpeedLimitBadgeProps = {
  limitKmh: number;
  className?: string;
};

export function SpeedLimitBadge({ limitKmh, className }: SpeedLimitBadgeProps) {
  return (
    <div
      className={cn(
        "relative flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_0_0_3px_#dc2626]",
        className,
      )}
      aria-label={`Speed limit ${limitKmh} kilometers per hour`}
    >
      <span className="text-[15px] font-bold leading-none tabular-nums text-black">
        {limitKmh}
      </span>
    </div>
  );
}
