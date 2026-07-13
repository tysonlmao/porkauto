import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import {
  findNextManeuver,
  findThenManeuver,
} from "@/lib/navigationCamera";
import { resolveAppearance } from "@/lib/displayTheme";
import { useVehicleStore } from "@/store/vehicle";
import { HostSettings } from "@/components/setup/HostSettings";
import { Clock } from "./Clock";
import { IndevButton } from "./IndevButton";
import { ManeuverBanner } from "./ManeuverBanner";
import { MusicWidget } from "./MusicWidget";
import { NavStatus } from "./NavStatus";
import { PrndlIndicator } from "./PrndlIndicator";
import { SpeedLimitBadge } from "./SpeedLimitBadge";
import { Speedometer } from "./Speedometer";
import { cn } from "@/lib/utils";

export function HudOverlay() {
  const mode = useVehicleStore((s) => s.mode);
  const gear = useVehicleStore((s) => s.gear);
  const speedKmh = useVehicleStore((s) => s.speedKmh);
  const speedLimitKmh = useVehicleStore((s) => s.speedLimitKmh);
  const music = useVehicleStore((s) => s.music);
  const spotifyNeedsGesture = useVehicleStore((s) => s.spotifyNeedsGesture);
  const navigating = useVehicleStore((s) => s.navigating);
  const destination = useVehicleStore((s) => s.destination);
  const nav = useVehicleStore((s) => s.nav);
  const route = useVehicleStore((s) => s.route);
  const position = useVehicleStore((s) => s.position);
  const displayTheme = useVehicleStore((s) => s.displayTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (displayTheme !== "daylight" && displayTheme !== "system") return;
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [displayTheme]);

  const appearance = resolveAppearance(displayTheme, new Date(nowTick));
  const light = appearance === "light";

  const parkClockRef = useRef<HTMLDivElement>(null);
  const [parkClockWidth, setParkClockWidth] = useState<number | null>(null);

  useEffect(() => {
    if (mode !== "park") {
      setParkClockWidth(null);
      return;
    }
    const el = parkClockRef.current;
    if (!el) return;
    const sync = () => setParkClockWidth(el.getBoundingClientRect().width);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const reversing = gear === "R";

  const overLimit =
    mode === "drive" &&
    !reversing &&
    speedLimitKmh != null &&
    speedKmh > speedLimitKmh;

  const nextManeuver =
    navigating && route?.steps?.length
      ? findNextManeuver(position, route.steps)
      : null;
  const thenManeuver =
    navigating && route?.steps?.length
      ? findThenManeuver(position, route.steps)
      : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {!reversing && !navigating ? (
        <div
          className={
            light
              ? "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(236,239,243,0.55)_100%)]"
              : "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(18,20,26,0.5)_100%)]"
          }
          aria-hidden
        />
      ) : null}

      {spotifyNeedsGesture && !reversing ? (
        <button
          type="button"
          className="pointer-events-auto absolute inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-20 mx-auto max-w-md rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-center text-[13px] text-zinc-200 backdrop-blur-sm"
        >
          Tap to enable Spotify audio on this display
        </button>
      ) : null}

      <div className="absolute flex flex-col items-end gap-2.5 safe-top safe-right">
        <div
          key={`status-${mode}-${gear}`}
          className="hud-fade-in flex flex-col items-end gap-2.5"
        >
          <PrndlIndicator gear={gear} />
          {mode !== "park" && !reversing ? (
            <>
              <Speedometer speedKmh={speedKmh} overLimit={overLimit} />
              {mode === "drive" && speedLimitKmh != null ? (
                <div className="mt-1">
                  <SpeedLimitBadge limitKmh={speedLimitKmh} />
                </div>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={cn(
              "pointer-events-auto mt-1 flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] backdrop-blur-sm",
              light
                ? "border-zinc-400/35 bg-white/70 text-zinc-600 hover:text-zinc-900"
                : "border-white/10 bg-black/50 text-zinc-400 hover:text-zinc-200",
            )}
            aria-label="Open settings"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </div>

      {mode === "park" && !reversing ? (
        <div key="park" className="absolute inset-0 hud-fade-in">
          <div className="absolute inset-0 flex items-center justify-center">
            <div ref={parkClockRef} className="w-max max-w-[calc(100vw-3rem)]">
              <Clock variant="hero" />
            </div>
          </div>
          {music ? (
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              <div
                className="max-w-[calc(100vw-3rem)]"
                style={
                  parkClockWidth != null
                    ? { width: parkClockWidth }
                    : undefined
                }
              >
                <MusicWidget
                  track={music}
                  variant="park"
                  className="w-full max-w-none"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {reversing ? (
        <div className="absolute safe-top safe-left">
          <IndevButton />
        </div>
      ) : mode === "drive" ? (
        <div
          key="drive-left"
          className="absolute flex flex-col items-start gap-5 hud-fade-in safe-top safe-left"
        >
          <Clock variant="compact" />
          {music ? <MusicWidget track={music} /> : null}
          <IndevButton className="mt-1" />
        </div>
      ) : (
        <div
          key="park-left"
          className="absolute flex flex-col items-start gap-5 hud-fade-in safe-top safe-left"
        >
          <IndevButton className="mt-1" />
        </div>
      )}

      {mode === "drive" && !reversing && navigating && nextManeuver ? (
        <div
          key="drive-maneuver"
          className="absolute inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-20 flex justify-center px-4 hud-fade-in"
        >
          <ManeuverBanner
            instruction={nextManeuver.instruction}
            distanceM={nextManeuver.distanceM}
            type={nextManeuver.type}
            modifier={nextManeuver.modifier}
            thenManeuver={thenManeuver}
            appearance={appearance}
          />
        </div>
      ) : null}

      {mode === "drive" && !reversing && navigating && destination ? (
        <div key="drive-nav" className="absolute hud-fade-in safe-bottom safe-left">
          <NavStatus
            destinationName={destination.name}
            destinationLocation={destination.location}
            position={position}
            etaTime={nav?.etaTime}
            remainingMinutes={nav?.remainingMinutes}
            remainingDistanceM={nav?.remainingDistanceM}
            offRoute={nav?.offRoute}
            appearance={appearance}
          />
        </div>
      ) : null}

      <HostSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
