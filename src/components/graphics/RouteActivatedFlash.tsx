import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MgScene } from "./MgScene";
import { MgRouteActivated } from "./scenes/route-activated";

type RouteFlashProps = {
  active: boolean;
  className?: string;
  /** How long the flash stays visible (ms). */
  durationMs?: number;
};

/**
 * Brief route-locked micrographic when navigation arms/starts.
 * Fires on the rising edge of `active` only.
 */
export function RouteActivatedFlash({
  active,
  className,
  durationMs = 2400,
}: RouteFlashProps) {
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState(0);
  const wasActive = useRef(false);

  useEffect(() => {
    const rising = active && !wasActive.current;
    wasActive.current = active;
    if (!rising) return;

    setVisible(true);
    setToken((t) => t + 1);
    const handle = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(handle);
  }, [active, durationMs]);

  if (!visible) return null;

  return (
    <div
      key={token}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-30 flex justify-center px-4 mg-flash-in",
        className,
      )}
      aria-hidden
    >
      <div className="rounded-sm border border-emerald-400/25 bg-black/75 px-4 py-2.5 text-white/85 backdrop-blur-md">
        <MgScene scene={MgRouteActivated} width={280} className="opacity-95" />
      </div>
    </div>
  );
}
