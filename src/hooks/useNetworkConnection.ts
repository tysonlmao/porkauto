import { useEffect } from "react";
import {
  readConnectionStatus,
  subscribeConnectionChanges,
} from "@/lib/networkConnection";
import { useVehicleStore } from "@/store/vehicle";

/** Keep HUD connection icon in sync with the real network. */
export function useNetworkConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const setConnection = useVehicleStore.getState().setConnection;
    setConnection(readConnectionStatus());

    return subscribeConnectionChanges(setConnection);
  }, [enabled]);
}
