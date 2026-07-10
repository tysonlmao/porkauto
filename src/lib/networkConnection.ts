import type { ConnectionStatus, SignalBars } from "@/store/types";

type ConnectionType =
  | "bluetooth"
  | "cellular"
  | "ethernet"
  | "none"
  | "other"
  | "unknown"
  | "wifi"
  | "wimax";

type EffectiveConnectionType = "2g" | "3g" | "4g" | "slow-2g";

type NetworkInformation = EventTarget & {
  type?: ConnectionType;
  effectiveType?: EffectiveConnectionType;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

function getNetworkInfo(): NetworkInformation | null {
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function barsFromQuality(info: NetworkInformation | null): SignalBars {
  if (!info) return 3;

  const downlink = info.downlink;
  if (typeof downlink === "number" && Number.isFinite(downlink)) {
    if (downlink >= 10) return 4;
    if (downlink >= 4) return 3;
    if (downlink >= 1.5) return 2;
    if (downlink > 0) return 1;
  }

  const rtt = info.rtt;
  if (typeof rtt === "number" && Number.isFinite(rtt) && rtt > 0) {
    if (rtt <= 100) return 4;
    if (rtt <= 200) return 3;
    if (rtt <= 400) return 2;
    return 1;
  }

  switch (info.effectiveType) {
    case "4g":
      return 4;
    case "3g":
      return 2;
    case "2g":
    case "slow-2g":
      return 1;
    default:
      return 3;
  }
}

function cellularGeneration(
  info: NetworkInformation | null,
): "4G" | "5G" {
  // Network Information API still reports 5G as effectiveType "4g".
  // High downlink is a practical stand-in when type is cellular.
  const downlink = info?.downlink;
  if (typeof downlink === "number" && downlink >= 50) return "5G";
  return "4G";
}

/**
 * Read the current connection for the HUD.
 * Uses Network Information API when available; otherwise online → Wi‑Fi.
 */
export function readConnectionStatus(): ConnectionStatus {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    return { type: "offline" };
  }

  const info = getNetworkInfo();
  const type = info?.type;

  if (type === "none") return { type: "offline" };
  if (type === "ethernet") return { type: "ethernet" };
  if (type === "wifi" || type === "wimax") {
    return { type: "wifi", bars: barsFromQuality(info) };
  }
  if (type === "cellular") {
    return {
      type: "cellular",
      generation: cellularGeneration(info),
      bars: barsFromQuality(info),
    };
  }

  // No `type` (Safari / many WebKits): infer from effectiveType when present.
  if (info?.effectiveType && !type) {
    // effectiveType alone can't distinguish Wi‑Fi vs cellular; prefer Wi‑Fi
    // on tablets/desktops, but if downlink is cellular-like and saveData is on,
    // still show Wi‑Fi as the safer HUD default for this app.
    return { type: "wifi", bars: barsFromQuality(info) };
  }

  return { type: "wifi", bars: barsFromQuality(info) };
}

export function subscribeConnectionChanges(
  onChange: (status: ConnectionStatus) => void,
): () => void {
  const publish = () => onChange(readConnectionStatus());

  window.addEventListener("online", publish);
  window.addEventListener("offline", publish);

  const info = getNetworkInfo();
  info?.addEventListener("change", publish);

  return () => {
    window.removeEventListener("online", publish);
    window.removeEventListener("offline", publish);
    info?.removeEventListener("change", publish);
  };
}
