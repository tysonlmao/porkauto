import { useVehicleStore } from "@/store/vehicle";
import { Clock } from "./Clock";
import { ConnectionStatus } from "./ConnectionStatus";
import { IndevButton } from "./IndevButton";
import { MusicWidget } from "./MusicWidget";
import { NavStatus } from "./NavStatus";
import { PrndlIndicator } from "./PrndlIndicator";
import { SpeedLimitBadge } from "./SpeedLimitBadge";
import { Speedometer } from "./Speedometer";

function modeLabel(mode: "connecting" | "park" | "drive"): string {
  if (mode === "connecting") return "connecting";
  if (mode === "park") return "park mode";
  return "drive mode";
}

export function HudOverlay() {
  const mode = useVehicleStore((s) => s.mode);
  const gear = useVehicleStore((s) => s.gear);
  const speedKmh = useVehicleStore((s) => s.speedKmh);
  const speedLimitKmh = useVehicleStore((s) => s.speedLimitKmh);
  const connection = useVehicleStore((s) => s.connection);
  const music = useVehicleStore((s) => s.music);
  const navigating = useVehicleStore((s) => s.navigating);
  const destination = useVehicleStore((s) => s.destination);
  const position = useVehicleStore((s) => s.position);

  const overLimit =
    mode === "drive" &&
    speedLimitKmh != null &&
    speedKmh > speedLimitKmh;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.55)_100%)]"
        aria-hidden
      />

      <p className="absolute text-[11px] font-medium lowercase tracking-[0.16em] text-zinc-600 safe-top safe-left">
        {modeLabel(mode)}
      </p>

      <div className="absolute flex flex-col items-end gap-2.5 safe-top safe-right">
        <ConnectionStatus connection={connection} />
        {mode !== "connecting" ? (
          <div
            key={`status-${mode}`}
            className="hud-fade-in flex flex-col items-end gap-2.5"
          >
            <PrndlIndicator gear={gear} />
            <Speedometer speedKmh={speedKmh} overLimit={overLimit} />
            {mode === "drive" && speedLimitKmh != null ? (
              <div className="mt-1">
                <SpeedLimitBadge limitKmh={speedLimitKmh} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === "connecting" ? (
        <div
          key="connecting"
          className="absolute inset-0 flex items-center justify-center hud-fade-in"
        >
          <p className="hud-breathe text-5xl font-semibold tracking-[-0.03em] text-white md:text-6xl">
            Connecting...
          </p>
        </div>
      ) : null}

      {mode === "park" ? (
        <div
          key="park"
          className="absolute inset-0 flex items-center justify-center hud-fade-in"
        >
          <Clock variant="hero" />
        </div>
      ) : null}

      {/* Left stack: time, music, then indev controls */}
      {mode === "drive" ? (
        <div
          key="drive-left"
          className="absolute top-[calc(3.25rem+env(safe-area-inset-top,0px))] flex flex-col items-start gap-5 hud-fade-in safe-left"
        >
          <Clock variant="compact" />
          {music ? <MusicWidget track={music} /> : null}
          <IndevButton className="mt-1" />
        </div>
      ) : (
        <div className="absolute top-[calc(3.5rem+env(safe-area-inset-top,0px))] safe-left">
          <IndevButton />
        </div>
      )}

      {mode === "drive" && navigating && destination ? (
        <div key="drive-nav" className="absolute hud-fade-in safe-bottom safe-left">
          <NavStatus
            destinationName={destination.name}
            destinationLocation={destination.location}
            position={position}
          />
        </div>
      ) : null}
    </div>
  );
}
