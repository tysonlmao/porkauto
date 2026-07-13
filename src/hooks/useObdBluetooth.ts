import { useEffect, useState } from "react";
import { obdClient, webBluetoothObdAvailable } from "@/lib/obdBluetooth";
import { useVehicleStore } from "@/store/vehicle";

/**
 * Optional OBD-II Bluetooth (BLE UART / ELM327) speed feed.
 * Classic HC-05 SPP dongles need a future Electrobun native bridge —
 * this path still works with BLE adapters and keeps the store wired.
 */
export function useObdBluetooth(enabled: boolean) {
  const setObdConnected = useVehicleStore((s) => s.setObdConnected);
  const setSpeedFromSensor = useVehicleStore((s) => s.setSpeedFromSensor);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return obdClient.subscribe((snap) => {
      setObdConnected(snap.connected);
      if (snap.connected && snap.speedKmh != null) {
        setSpeedFromSensor(snap.speedKmh, "obd");
      }
    });
  }, [enabled, setObdConnected, setSpeedFromSensor]);

  async function connect() {
    setError(null);
    setConnecting(true);
    try {
      await obdClient.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "OBD connect failed");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    setError(null);
    await obdClient.disconnect();
  }

  return {
    available: webBluetoothObdAvailable(),
    connected: useVehicleStore((s) => s.obdConnected),
    connecting,
    error,
    connect,
    disconnect,
  };
}
