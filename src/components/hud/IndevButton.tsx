import { useVehicleStore } from "@/store/vehicle";
import { unpairAndResetHost } from "@/hooks/usePairingSync";
import { devToolsEnabled } from "@/lib/devTools";
import { cn } from "@/lib/utils";

type IndevButtonProps = {
  className?: string;
};

export function IndevButton({ className }: IndevButtonProps) {
  const setupComplete = useVehicleStore((s) => s.setupComplete);
  const paired = useVehicleStore((s) => s.paired);
  const companionName = useVehicleStore((s) => s.companionName);
  const deviceName = useVehicleStore((s) => s.deviceName);

  if (!devToolsEnabled()) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col items-start gap-1.5",
        className,
      )}
    >
      {setupComplete ? (
        <p
          className={cn(
            "max-w-[16rem] px-1 font-mono text-[10px] tracking-[0.06em]",
            paired ? "text-emerald-400/90" : "text-zinc-600",
          )}
        >
          {paired && (companionName || deviceName)
            ? `Paired to ${companionName || deviceName}`
            : paired
              ? "Paired"
              : "Not paired"}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          void unpairAndResetHost();
        }}
        className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600 transition hover:text-zinc-400"
      >
        reset setup
      </button>
    </div>
  );
}
