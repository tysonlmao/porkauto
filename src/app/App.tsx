import { MapBackground } from "@/components/map/MapBackground";
import { HudOverlay } from "@/components/hud/HudOverlay";
import { IndevButton } from "@/components/hud/IndevButton";
import { DestinationSearch } from "@/components/nav/DestinationSearch";
import { PermissionsGate } from "@/components/nav/PermissionsGate";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { KeyboardProvider } from "@/components/keyboard/KeyboardProvider";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { useDeviceMotion } from "@/hooks/useDeviceMotion";
import { useNetworkConnection } from "@/hooks/useNetworkConnection";
import { usePairingSync } from "@/hooks/usePairingSync";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { useVehicleStore } from "@/store/vehicle";

export function App() {
  const setupComplete = useVehicleStore((s) => s.setupComplete);
  useNetworkConnection(true);
  useDeviceLocation(setupComplete);
  useDeviceMotion(setupComplete);
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
      <div className="app-shell relative bg-black text-white">
        <MapBackground />
        <HudOverlay />
        <DestinationSearch />
        <PermissionsGate />
      </div>
    </KeyboardProvider>
  );
}
