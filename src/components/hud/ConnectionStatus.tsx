import { Cable, Wifi, WifiOff } from "lucide-react";
import type {
  ConnectionStatus as ConnectionData,
  SignalBars,
} from "@/store/types";
import { cn } from "@/lib/utils";

type ConnectionStatusProps = {
  connection: ConnectionData;
  className?: string;
};

function SignalBarsIcon({
  bars,
  className,
}: {
  bars: SignalBars;
  className?: string;
}) {
  const heights = [5, 8, 12, 16];
  return (
    <div className={cn("flex items-end gap-[2px]", className)} aria-hidden>
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-[2.5px] rounded-[0.5px] transition-colors duration-300",
            i < bars ? "bg-white" : "bg-zinc-700",
          )}
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

export function ConnectionStatus({
  connection,
  className,
}: ConnectionStatusProps) {
  if (connection.type === "offline") {
    return (
      <div
        className={cn("flex items-center gap-1.5 text-zinc-600", className)}
        title="Offline"
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Offline</span>
      </div>
    );
  }

  if (connection.type === "wifi") {
    return (
      <div
        className={cn("flex items-center gap-1.5 text-white/90", className)}
        title={`Wi‑Fi · ${connection.bars}/4`}
      >
        <Wifi className="h-3.5 w-3.5" aria-hidden />
        <SignalBarsIcon bars={connection.bars} />
        <span className="sr-only">Wi‑Fi signal {connection.bars} of 4</span>
      </div>
    );
  }

  if (connection.type === "ethernet") {
    return (
      <div
        className={cn("flex items-center gap-1.5 text-white/90", className)}
        title="Ethernet"
      >
        <Cable className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">
          LAN
        </span>
        <span className="sr-only">Ethernet connected</span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center gap-1.5 text-white/90", className)}
      title={`${connection.generation} · ${connection.bars}/4`}
    >
      <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-300">
        {connection.generation}
      </span>
      <SignalBarsIcon bars={connection.bars} />
      <span className="sr-only">
        {connection.generation} signal {connection.bars} of 4
      </span>
    </div>
  );
}
