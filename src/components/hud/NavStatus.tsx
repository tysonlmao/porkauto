import type { NavStatus as NavStatusData } from "@/store/types";
import { cn } from "@/lib/utils";

type NavStatusProps = {
  nav: NavStatusData;
  className?: string;
};

export function NavStatus({ nav, className }: NavStatusProps) {
  return (
    <div className={cn("leading-[1.35]", className)}>
      <p className="text-[14px] text-zinc-400">
        eta {nav.etaTime}{" "}
        <span className="font-semibold text-white">
          {nav.remainingMinutes} min
        </span>
      </p>
      <p className="text-[14px] font-medium text-[#7CFF9A]">
        arriving to {nav.destination}
      </p>
    </div>
  );
}
