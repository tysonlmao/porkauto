import { MapBackground } from "@/components/map/MapBackground";
import { HudOverlay } from "@/components/hud/HudOverlay";
import { ReverseCamera } from "@/components/hud/ReverseCamera";
import { IndevButton } from "@/components/hud/IndevButton";
import { DestinationSearch } from "@/components/nav/DestinationSearch";
import { PermissionsGate } from "@/components/nav/PermissionsGate";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { KeyboardProvider } from "@/components/keyboard/KeyboardProvider";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useDeviceMotion } from "@/hooks/useDeviceMotion";
import { useNetworkConnection } from "@/hooks/useNetworkConnection";
import { usePairingSync } from "@/hooks/usePairingSync";
import { useSpeedLimit } from "@/hooks/useSpeedLimit";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { resolveAppearance } from "@/lib/displayTheme";
import { hudBackdropColor } from "@/lib/mapTheme";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";

export function App() {
  const setupComplete = useVehicleStore((s) => s.setupComplete);
  const gear = useVehicleStore((s) => s.gear);
  const displayTheme = useVehicleStore((s) => s.displayTheme);
  const appearance = resolveAppearance(displayTheme);
  const light = appearance === "light";
  useNetworkConnection(true);
  useDeviceLocation(setupComplete);
  useDeviceMotion(setupComplete);
  useSpeedLimit(setupComplete);
  usePairingSync(setupComplete);
  useSpotifyPlayer(setupComplete);

  if (!setupComplete) {
    return (
      <KeyboardProvider>
        <div className="app-shell relative bg-black">
          <SetupScreen />
          <div className="safe-top safe-left absolute z-50">
            <IndevButton />
          </div>
        </div>
      </KeyboardProvider>
    );
  }

  return (
    <KeyboardProvider>
      <div
        className={cn(
          "app-shell relative",
          light ? "bg-[#e9ecef] text-zinc-900" : "bg-[#0e1014] text-white",
        )}
        style={{ backgroundColor: hudBackdropColor(appearance) }}
      >
        <MapBackground />
        <ReverseCamera />
        <HudOverlay />
        {gear !== "R" ? <DestinationSearch /> : null}
        <PermissionsGate />
      </div>
    </KeyboardProvider>
  );
}
