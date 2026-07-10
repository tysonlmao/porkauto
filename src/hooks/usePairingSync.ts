import { useEffect, useRef } from "react";
import { fetchDeviceConfig, unpairDevice } from "@/lib/api";
import { useVehicleStore } from "@/store/vehicle";
import type { SavedLocation } from "@/store/types";

const POLL_MS = 2500;

function parseSavedLocations(config: Record<string, unknown>): SavedLocation[] {
  const raw = config.savedLocations;
  if (!Array.isArray(raw)) return [];
  const out: SavedLocation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const address = typeof row.address === "string" ? row.address.trim() : "";
    if (!id || !label || !address) continue;
    const lat = typeof row.lat === "number" ? row.lat : undefined;
    const lng = typeof row.lng === "number" ? row.lng : undefined;
    out.push({ id, label, address, lat, lng });
  }
  return out;
}

/**
 * While the HUD is active, poll claim status.
 * If the companion unpairs, reset the host back to setup.
 */
export function usePairingSync(enabled: boolean) {
  const deviceId = useVehicleStore((s) => s.deviceId);
  const deviceToken = useVehicleStore((s) => s.deviceToken);
  const deviceApiKey = useVehicleStore((s) => s.deviceApiKey);
  const paired = useVehicleStore((s) => s.paired);
  const setPairingStatus = useVehicleStore((s) => s.setPairingStatus);
  const resetSetup = useVehicleStore((s) => s.resetSetup);
  const wasConfirmed = useRef(paired);

  useEffect(() => {
    wasConfirmed.current = wasConfirmed.current || paired;
  }, [paired]);

  useEffect(() => {
    if (!enabled || !deviceId) return;
    const credential = deviceApiKey || deviceToken;
    if (!credential) return;

    let cancelled = false;

    async function poll() {
      try {
        const status = await fetchDeviceConfig(deviceId!, credential!);
        if (cancelled) return;

        if (status.pairingStatus === "confirmed") {
          wasConfirmed.current = true;
          const home =
            typeof status.config?.homeAddress === "string"
              ? status.config.homeAddress.trim() || null
              : null;
          setPairingStatus({
            paired: true,
            deviceName: status.name || undefined,
            homeAddress: home,
            savedLocations: parseSavedLocations(
              (status.config ?? {}) as Record<string, unknown>,
            ),
          });
          return;
        }

        // Confirmed pairing was cleared (mobile or host unpair) → reset host.
        if (wasConfirmed.current || paired) {
          resetSetup();
          return;
        }

        setPairingStatus({
          paired: false,
          deviceName: status.name || undefined,
        });
      } catch {
        // Ignore transient errors (tunnel blips).
      }
    }

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    enabled,
    deviceId,
    deviceToken,
    deviceApiKey,
    paired,
    setPairingStatus,
    resetSetup,
  ]);
}

/** Unpair on the API (if possible), then clear local setup. */
export async function unpairAndResetHost(): Promise<void> {
  const state = useVehicleStore.getState();
  const credential = state.deviceApiKey || state.deviceToken;
  if (state.deviceId && credential) {
    try {
      await unpairDevice(state.deviceId, credential);
    } catch {
      // Still reset locally.
    }
  }
  state.resetSetup();
}
