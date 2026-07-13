import { useEffect, useRef } from "react";
import { fetchDeviceConfig, isFatalDeviceError, unpairDevice } from "@/lib/api";
import { useVehicleStore } from "@/store/vehicle";
import type { SavedLocation } from "@/store/types";

/** Config sync / unpair check — once per minute. */
const POLL_MS = 60_000;

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

function sameLocations(a: SavedLocation[], b: SavedLocation[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((loc, i) => {
    const other = b[i];
    return (
      !!other &&
      loc.id === other.id &&
      loc.label === other.label &&
      loc.address === other.address &&
      loc.lat === other.lat &&
      loc.lng === other.lng
    );
  });
}

/**
 * While the HUD is active, poll claim status.
 * If the companion unpairs, reset the host back to setup.
 */
export function usePairingSync(enabled: boolean) {
  const deviceId = useVehicleStore((s) => s.deviceId);
  const deviceToken = useVehicleStore((s) => s.deviceToken);
  const deviceApiKey = useVehicleStore((s) => s.deviceApiKey);
  const setPairingStatus = useVehicleStore((s) => s.setPairingStatus);
  const resetSetup = useVehicleStore((s) => s.resetSetup);
  const wasConfirmed = useRef(useVehicleStore.getState().paired);
  const inflight = useRef(false);

  useEffect(() => {
    if (!enabled || !deviceId) return;
    const credential = deviceApiKey || deviceToken;
    if (!credential) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      if (cancelled || inflight.current) return;
      inflight.current = true;
      try {
        const status = await fetchDeviceConfig(deviceId!, credential!);
        if (cancelled) return;

        const state = useVehicleStore.getState();

        if (status.pairingStatus === "confirmed") {
          wasConfirmed.current = true;
          const home =
            typeof status.config?.homeAddress === "string"
              ? status.config.homeAddress.trim() || null
              : null;
          const savedLocations = parseSavedLocations(
            (status.config ?? {}) as Record<string, unknown>,
          );
          const nextName = status.name || undefined;
          const nextCompanion = status.companionName || undefined;

          // Avoid store churn (and effect restarts) when nothing changed.
          if (
            state.paired &&
            state.deviceName === (nextName ?? state.deviceName) &&
            state.companionName === (nextCompanion ?? state.companionName) &&
            state.homeAddress === (home ?? state.homeAddress) &&
            sameLocations(state.savedLocations, savedLocations)
          ) {
            return;
          }

          setPairingStatus({
            paired: true,
            deviceName: nextName,
            companionName: nextCompanion,
            homeAddress: home,
            savedLocations,
          });
          return;
        }

        // Confirmed pairing was cleared (mobile or host unpair) → reset host.
        if (wasConfirmed.current || state.paired) {
          resetSetup();
          return;
        }

        if (!state.paired) {
          setPairingStatus({
            paired: false,
            deviceName: status.name || undefined,
            companionName: status.companionName || undefined,
          });
        }
      } catch (err) {
        if (cancelled) return;
        // Bad/stale credentials or purged device — stop hammering the API.
        if (isFatalDeviceError(err)) {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          cancelled = true;
          resetSetup();
          return;
        }
        // Ignore transient errors (tunnel blips).
      } finally {
        inflight.current = false;
      }
    }

    void poll();
    timer = setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [
    enabled,
    deviceId,
    deviceToken,
    deviceApiKey,
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
