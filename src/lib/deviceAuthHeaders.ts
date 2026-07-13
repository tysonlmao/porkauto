import { useVehicleStore } from "@/store/vehicle";

/** Authorization headers for device-scoped API calls (e.g. /geo/*). */
export function deviceAuthHeaders(): HeadersInit {
  const { deviceId, deviceApiKey, deviceToken } = useVehicleStore.getState();
  const credential = deviceApiKey || deviceToken;
  if (!deviceId || !credential) {
    throw new Error("Device credentials required for map/geo requests");
  }
  return {
    Authorization: `Bearer ${credential}`,
    "X-Device-Id": deviceId,
  };
}
