/**
 * ELM327-over-Bluetooth OBD-II client.
 *
 * Most cheap "Bluetooth OBD" dongles are classic SPP (HC-05). Browsers cannot
 * open classic RFCOMM; Electrobun/Chromium can use Web Bluetooth for BLE UART
 * clones (Nordic UART / similar). This module targets BLE UART and keeps the
 * AT/PID protocol ready for a future native SPP bridge.
 */

const NORDIC_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_UART_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write
const NORDIC_UART_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify

export type ObdSnapshot = {
  speedKmh: number | null;
  rpm: number | null;
  connected: boolean;
};

export type ObdListener = (snap: ObdSnapshot) => void;

function parsePidResponse(hexLine: string, pid: number): number | null {
  // Typical: "41 0D 3C" → mode 01 response for PID 0D, value 0x3C
  const cleaned = hexLine
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F ]/g, "");
  const parts = cleaned.split(" ").filter(Boolean);
  const pidHex = pid.toString(16).toUpperCase().padStart(2, "0");
  const idx = parts.findIndex(
    (p, i) => p === "41" && parts[i + 1] === pidHex && parts[i + 2],
  );
  if (idx < 0) return null;
  const a = Number.parseInt(parts[idx + 2]!, 16);
  if (!Number.isFinite(a)) return null;
  if (pid === 0x0d) return a; // km/h
  if (pid === 0x0c) {
    const b = Number.parseInt(parts[idx + 3] ?? "0", 16);
    return Math.round(((a * 256 + b) / 4) * 10) / 10; // RPM
  }
  return a;
}

export function webBluetoothObdAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export class ObdBluetoothClient {
  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private buffer = "";
  private pollTimer: number | null = null;
  private listeners = new Set<ObdListener>();
  private snap: ObdSnapshot = {
    speedKmh: null,
    rpm: null,
    connected: false,
  };

  subscribe(listener: ObdListener): () => void {
    this.listeners.add(listener);
    listener(this.snap);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l(this.snap);
  }

  get snapshot(): ObdSnapshot {
    return this.snap;
  }

  async connect(): Promise<void> {
    if (!webBluetoothObdAvailable()) {
      throw new Error(
        "Web Bluetooth is unavailable. Use a BLE OBD adapter, or a future Electrobun classic-Bluetooth bridge for HC-05/SPP dongles.",
      );
    }

    const device = await navigator.bluetooth!.requestDevice({
      filters: [{ services: [NORDIC_UART_SERVICE] }],
      optionalServices: [NORDIC_UART_SERVICE],
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(NORDIC_UART_SERVICE);
    this.rx = await service.getCharacteristic(NORDIC_UART_RX);
    this.tx = await service.getCharacteristic(NORDIC_UART_TX);

    await this.tx.startNotifications();
    this.tx.addEventListener("characteristicvaluechanged", this.onNotify);
    device.addEventListener("gattserverdisconnected", this.onDisconnect);

    this.device = device;
    this.snap = { ...this.snap, connected: true };
    this.emit();

    await this.initElm();
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    if (this.tx) {
      try {
        this.tx.removeEventListener(
          "characteristicvaluechanged",
          this.onNotify,
        );
        await this.tx.stopNotifications();
      } catch {
        // ignore
      }
    }
    this.device?.gatt?.disconnect();
    this.device = null;
    this.rx = null;
    this.tx = null;
    this.snap = { speedKmh: null, rpm: null, connected: false };
    this.emit();
  }

  private onDisconnect = () => {
    this.stopPolling();
    this.snap = { speedKmh: null, rpm: null, connected: false };
    this.emit();
  };

  private onNotify = (ev: Event) => {
    const target = ev.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    const text = new TextDecoder().decode(value.buffer);
    this.buffer += text;
    if (this.buffer.includes(">")) {
      const lines = this.buffer.split(/[\r\n]+/).map((l) => l.trim());
      this.buffer = "";
      for (const line of lines) {
        if (!line || line === ">") continue;
        const speed = parsePidResponse(line, 0x0d);
        if (speed != null) {
          this.snap = { ...this.snap, speedKmh: speed };
          this.emit();
        }
        const rpm = parsePidResponse(line, 0x0c);
        if (rpm != null) {
          this.snap = { ...this.snap, rpm };
          this.emit();
        }
      }
    }
  };

  private async write(cmd: string): Promise<void> {
    if (!this.rx) throw new Error("OBD not connected");
    const payload = new TextEncoder().encode(`${cmd}\r`);
    await this.rx.writeValueWithoutResponse(payload);
  }

  private async initElm(): Promise<void> {
    for (const cmd of ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"]) {
      await this.write(cmd);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      void this.write("010D"); // vehicle speed
      window.setTimeout(() => {
        void this.write("010C"); // RPM
      }, 200);
    }, 500);
  }

  private stopPolling() {
    if (this.pollTimer != null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

/** Shared singleton for the HUD. */
export const obdClient = new ObdBluetoothClient();
