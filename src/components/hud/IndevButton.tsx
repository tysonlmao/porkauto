import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";

type IndevButtonProps = {
  className?: string;
};

export function IndevButton({ className }: IndevButtonProps) {
  const cycleIndev = useVehicleStore((s) => s.cycleIndev);
  const mode = useVehicleStore((s) => s.mode);
  const resetSetup = useVehicleStore((s) => s.resetSetup);
  const setupComplete = useVehicleStore((s) => s.setupComplete);
  const setPosition = useVehicleStore((s) => s.setPosition);
  const position = useVehicleStore((s) => s.position);
  const route = useVehicleStore((s) => s.route);

  function nudgeAlongRoute() {
    const coords = route?.coordinates;
    if (!coords || coords.length < 2) {
      setPosition({ heading: (position.heading + 25) % 360 });
      return;
    }

    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i]!;
      const d = (c.lat - position.lat) ** 2 + (c.lng - position.lng) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = coords[Math.min(bestIdx + 8, coords.length - 1)]!;
    const after = coords[Math.min(bestIdx + 9, coords.length - 1)]!;
    const heading =
      (Math.atan2(after.lng - next.lng, after.lat - next.lat) * 180) / Math.PI;
    setPosition({
      lat: next.lat,
      lng: next.lng,
      heading: (heading + 360) % 360,
    });
  }

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col items-start gap-1.5",
        className,
      )}
    >
      {setupComplete ? (
        <>
          <button
            type="button"
            onClick={cycleIndev}
            className="rounded-md border border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-300 backdrop-blur-md transition hover:border-white/25 hover:text-white"
          >
            indev · {mode}
          </button>
          <button
            type="button"
            onClick={nudgeAlongRoute}
            className="rounded-md border border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 backdrop-blur-md transition hover:border-white/25 hover:text-white"
          >
            indev · move
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={resetSetup}
        className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600 transition hover:text-zinc-400"
      >
        reset setup
      </button>
    </div>
  );
}
