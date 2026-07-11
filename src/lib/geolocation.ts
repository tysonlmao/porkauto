export type LocationSource = "gps" | "ip";

export type DeviceLocation = {
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  accuracyM: number;
  /** gps = browser Geolocation; ip = network approximate */
  source: LocationSource;
};

export type LocationErrorCode =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unknown";

export class LocationError extends Error {
  code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = "LocationError";
    this.code = code;
  }
}

/** Electrobun injects these on the renderer window. */
export function isElectrobunRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as Window & { __electrobunWindowId?: number })
      .__electrobunWindowId === "number"
  );
}

/**
 * True when this client is likely to have a real GNSS/Wi‑Fi location API
 * (phones, iPads — including iPadOS desktop-class UA spoofing).
 */
export function deviceLikelyHasGps(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // Electrobun desktop webview — treat as no device GPS.
  if (isElectrobunRuntime()) return false;

  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;

  // iPadOS 13+ often reports as Macintosh with touch points.
  if (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }

  // iOS Safari exposes requestPermission on orientation/motion.
  const orientation = DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<string>;
      })
    | undefined;
  if (typeof orientation?.requestPermission === "function") return true;

  return false;
}

/**
 * Use IP geolocation only on desktop/Electrobun where device GPS is unavailable.
 * GPS-capable devices (iPad, phone) must never settle on IP.
 */
export function shouldUseIpLocationFallback(): boolean {
  if (typeof window === "undefined") return false;
  if (deviceLikelyHasGps()) return false;
  return true;
}

/** @deprecated use shouldUseIpLocationFallback */
export function shouldUseFastLocationFallback(): boolean {
  return shouldUseIpLocationFallback();
}

function mapGeoError(err: GeolocationPositionError): LocationError {
  if (err.code === err.PERMISSION_DENIED) {
    return new LocationError(
      "denied",
      "Location permission denied. Allow location access for this app.",
    );
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return new LocationError(
      "unavailable",
      "Location unavailable. Check GPS / network location.",
    );
  }
  if (err.code === err.TIMEOUT) {
    return new LocationError("timeout", "Timed out waiting for location.");
  }
  return new LocationError("unknown", err.message || "Location failed");
}

function readPosition(pos: GeolocationPosition): DeviceLocation {
  const { latitude, longitude, heading, speed, accuracy } = pos.coords;
  return {
    lat: latitude,
    lng: longitude,
    heading:
      typeof heading === "number" && Number.isFinite(heading) ? heading : null,
    speedMps:
      typeof speed === "number" && Number.isFinite(speed) ? speed : null,
    accuracyM: accuracy,
    source: "gps",
  };
}

/** Quick network-ish fix, then a longer high-accuracy GPS attempt. */
const DESKTOP_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
];

const MOBILE_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
  { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
];

/** Prefer GPS when the platform can provide it. */
const watchOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30_000,
};

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function getPositionOnce(options: PositionOptions): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(readPosition(pos)),
      (err) => reject(mapGeoError(err)),
      options,
    );
  });
}

type IpPayload = {
  lat: number;
  lng: number;
  accuracyM: number;
};

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function parseLatLng(
  lat: unknown,
  lng: unknown,
  accuracyM: number,
): IpPayload | null {
  const la = typeof lat === "string" ? Number(lat) : lat;
  const ln = typeof lng === "string" ? Number(lng) : lng;
  if (
    typeof la !== "number" ||
    typeof ln !== "number" ||
    !Number.isFinite(la) ||
    !Number.isFinite(ln)
  ) {
    return null;
  }
  return { lat: la, lng: ln, accuracyM };
}

/** Approximate location from public IP — interim until GPS is available. */
export async function getIpBasedLocation(): Promise<DeviceLocation> {
  const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
  const providers: Array<() => Promise<IpPayload | null>> = [
    async () => {
      // Same-origin Vite proxy (works on Cloudflare tunnel).
      const data = (await fetchJson(`/geo/approx`)) as {
        lat?: number;
        lng?: number;
        accuracyM?: number;
      };
      return parseLatLng(data.lat, data.lng, data.accuracyM ?? 25_000);
    },
    async () => {
      if (!apiBase || apiBase.startsWith("/")) return null;
      const data = (await fetchJson(`${apiBase}/geo/approx`)) as {
        lat?: number;
        lng?: number;
        accuracyM?: number;
      };
      return parseLatLng(data.lat, data.lng, data.accuracyM ?? 25_000);
    },
    async () => {
      const data = (await fetchJson(
        "https://get.geojs.io/v1/ip/geo.json",
      )) as {
        latitude?: string | number;
        longitude?: string | number;
      };
      return parseLatLng(data.latitude, data.longitude, 25_000);
    },
    async () => {
      const data = (await fetchJson("https://ipwho.is/")) as {
        success?: boolean;
        latitude?: number;
        longitude?: number;
      };
      if (data.success === false) return null;
      return parseLatLng(data.latitude, data.longitude, 25_000);
    },
  ];

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      const parsed = await provider();
      if (!parsed) continue;
      return {
        lat: parsed.lat,
        lng: parsed.lng,
        heading: null,
        speedMps: null,
        accuracyM: parsed.accuracyM,
        source: "ip",
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new LocationError(
    "unavailable",
    lastError instanceof Error
      ? `Could not approximate location (${lastError.message})`
      : "Could not approximate location from network.",
  );
}

export async function getBrowserGeolocationOnly(): Promise<DeviceLocation> {
  if (!isGeolocationSupported()) {
    throw new LocationError("unsupported", "Geolocation is not supported.");
  }

  const attempts = shouldUseIpLocationFallback()
    ? DESKTOP_ATTEMPTS
    : MOBILE_ATTEMPTS;
  let lastError: LocationError | null = null;

  for (const options of attempts) {
    try {
      return await getPositionOnce(options);
    } catch (err) {
      lastError =
        err instanceof LocationError
          ? err
          : new LocationError("unknown", "Location failed");
      if (lastError.code === "denied" || lastError.code === "unsupported") {
        throw lastError;
      }
    }
  }

  throw (
    lastError ??
    new LocationError("timeout", "Timed out waiting for location.")
  );
}

/**
 * Resolve current location — GPS first.
 * IP fallback only on desktop/Electrobun (no device GPS).
 */
export async function getCurrentDeviceLocation(): Promise<DeviceLocation> {
  try {
    return await getBrowserGeolocationOnly();
  } catch (gpsErr) {
    if (!shouldUseIpLocationFallback()) {
      if (gpsErr instanceof LocationError) throw gpsErr;
      throw new LocationError("unavailable", "Could not get current location");
    }

    try {
      return await getIpBasedLocation();
    } catch {
      if (gpsErr instanceof LocationError) throw gpsErr;
      throw new LocationError("unavailable", "Could not get current location");
    }
  }
}

/**
 * Prefer GPS on every client that has it.
 * On desktop/Electrobun only: publish IP via `onUpdate` as an interim/fallback.
 */
export async function getDeviceLocationFast(
  onUpdate?: (loc: DeviceLocation) => void,
): Promise<DeviceLocation> {
  // Phones / iPads: GPS only — never IP.
  if (deviceLikelyHasGps()) {
    const loc = await getBrowserGeolocationOnly();
    onUpdate?.(loc);
    return loc;
  }

  if (!shouldUseIpLocationFallback()) {
    const loc = await getCurrentDeviceLocation();
    onUpdate?.(loc);
    return loc;
  }

  let ipLoc: DeviceLocation | null = null;
  let gpsWon = false;

  const ipPromise = getIpBasedLocation()
    .then((loc) => {
      ipLoc = loc;
      if (!gpsWon) onUpdate?.(loc);
      return loc;
    })
    .catch((err: unknown) => {
      throw err;
    });

  try {
    const gps = await getBrowserGeolocationOnly();
    gpsWon = true;
    onUpdate?.(gps);
    return gps;
  } catch (gpsErr) {
    try {
      const ip = ipLoc ?? (await ipPromise);
      onUpdate?.(ip);
      return ip;
    } catch {
      if (gpsErr instanceof LocationError) throw gpsErr;
      throw new LocationError("unavailable", "Could not get current location");
    }
  }
}

export function watchDeviceLocation(
  onUpdate: (location: DeviceLocation) => void,
  onError: (error: LocationError) => void,
): () => void {
  if (!isGeolocationSupported()) {
    onError(
      new LocationError("unsupported", "Geolocation is not supported."),
    );
    return () => {};
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate(readPosition(pos)),
    (err) => onError(mapGeoError(err)),
    watchOptions,
  );

  return () => navigator.geolocation.clearWatch(id);
}
