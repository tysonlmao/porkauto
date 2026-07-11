import { create } from "zustand";
import {
  DEFAULT_POSITION,
  type ActiveRoute,
  type AppMode,
  type ConnectionStatus,
  type Destination,
  type Gear,
  type MusicTrack,
  type MusicQueueItem,
  type NavStatus,
  type SavedLocation,
  type VehiclePosition,
  type VehicleState,
} from "./types";
import {
  bearingBetween,
  fetchDrivingRoute,
  formatEta,
  geocodePlaces,
  straightRoute,
} from "@/lib/routing";
import {
  getDeviceLocationFast,
  LocationError,
  type LocationSource,
} from "@/lib/geolocation";
import { normalizeHeading, shortestAngleDelta } from "@/lib/deviceMotion";
import { readConnectionStatus } from "@/lib/networkConnection";

const SETUP_KEY = "porkauto.setupComplete";
const DEVICE_KEY = "porkauto.device";

/** Bumped on clear / new setDestination so in-flight route builds cannot resurrect state. */
let destinationRequestId = 0;

type StoredDevice = {
  deviceId: string;
  pairingCode: string;
  token: string;
  /** Host API key shared with the backend for this display instance. */
  apiKey?: string;
  /** Registered display name. */
  name?: string;
  /** Companion phone/tablet name from claim. */
  companionName?: string;
  paired?: boolean;
};

type SpeedSource = "gps" | "imu" | "obd" | "indev" | null;
type HeadingSource = "gps" | "imu" | "obd" | "route" | null;

function loadSetupComplete(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === "1";
  } catch {
    return false;
  }
}

function loadDevice(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDevice;
  } catch {
    return null;
  }
}

type VehicleActions = {
  setMode: (mode: AppMode) => void;
  setGear: (gear: Gear) => void;
  setSpeed: (speedKmh: number) => void;
  setSpeedLimit: (speedLimitKmh: number | null) => void;
  setSpeedFromSensor: (speedKmh: number, source: "gps" | "imu" | "obd") => void;
  setObdConnected: (connected: boolean) => void;
  setMotionStatus: (
    status: Partial<{
      available: boolean;
      error: string | null;
      headingSource: HeadingSource;
    }>,
  ) => void;
  setConnection: (connection: ConnectionStatus) => void;
  setMusic: (music: MusicTrack | null) => void;
  setMusicQueue: (queue: MusicQueueItem[]) => void;
  setSpotifyNeedsGesture: (needed: boolean) => void;
  setNav: (nav: NavStatus | null) => void;
  setPosition: (position: Partial<VehiclePosition>) => void;
  setHeadingFromSensor: (
    heading: number,
    source: Exclude<HeadingSource, null>,
  ) => void;
  /** Blend mount/seating bias using GPS course while moving. */
  calibrateHeadingFromGpsCourse: (courseDeg: number, speedKmh: number) => void;
  setLocationStatus: (
    status: Partial<{
      locating: boolean;
      usingGps: boolean;
      locationSource: LocationSource | null;
      error: string | null;
    }>,
  ) => void;
  refreshLocation: () => Promise<void>;
  /** Call from a click/tap — required for iOS Safari motion + reliable location prompts. */
  requestDeviceAccess: () => Promise<void>;
  setDestination: (destination: Destination | null) => Promise<void>;
  clearDestination: () => void;
  /** Arm nav from Park — waits for R/N/D before turn-by-turn starts. */
  armNavigation: () => void;
  startNavigation: () => void;
  stopNavigation: () => void;
  searchDestinations: (query: string) => Promise<Destination[]>;
  completeSetup: (device: StoredDevice & { paired?: boolean }) => void;
  skipSetup: () => void;
  resetSetup: () => void;
  setPairingStatus: (status: {
    paired: boolean;
    deviceName?: string | null;
    companionName?: string | null;
    homeAddress?: string | null;
    savedLocations?: SavedLocation[];
  }) => void;
  setHomeAddress: (homeAddress: string | null) => void;
  setSavedLocations: (savedLocations: SavedLocation[]) => void;
};

type VehicleStore = VehicleState &
  VehicleActions & {
    navBusy: boolean;
    navError: string | null;
    /** Destination set + Start pressed in Park — waiting for R/N/D. */
    navReady: boolean;
    /** Active turn-by-turn follow (birds-eye camera). */
    navigating: boolean;
    locating: boolean;
    usingGps: boolean;
    locationSource: LocationSource | null;
    locationError: string | null;
    obdConnected: boolean;
    speedSource: SpeedSource;
    headingSource: HeadingSource;
    /** Degrees added to raw IMU heading (auto-calibrated from GPS course). */
    headingOffset: number;
    /** Last raw IMU heading before offset (for calibration). */
    lastImuRaw: number | null;
  motionAvailable: boolean;
  motionError: string | null;
  motionNeedsGesture: boolean;
  enableMotionSensors: (() => Promise<boolean>) | null;
  /** Browser blocked Spotify Web Playback autoplay until a user tap. */
  spotifyNeedsGesture: boolean;
  /** Wall-clock ms when `music` was last written — for progress extrapolation. */
  musicUpdatedAt: number | null;
  /** Next few tracks from Spotify queue. */
  musicQueue: MusicQueueItem[];
};

const stored = loadDevice();

async function buildRouteTo(
  position: VehiclePosition,
  destination: Destination,
): Promise<{ route: ActiveRoute; nav: NavStatus; heading: number }> {
  let route: ActiveRoute;
  try {
    route = await fetchDrivingRoute(position, destination.location);
  } catch {
    route = straightRoute(position, destination.location);
  }

  const { etaTime, remainingMinutes } = formatEta(route.durationSec);
  const nextPoint = route.coordinates[1] ?? destination.location;
  const heading = bearingBetween(position, nextPoint);

  return {
    route,
    heading,
    nav: {
      etaTime,
      remainingMinutes,
      destination: destination.name,
    },
  };
}

export const useVehicleStore = create<VehicleStore>((set, get) => ({
  mode: "park",
  gear: "P",
  speedKmh: 0,
  speedLimitKmh: null,
  connection: { type: "offline" },
  music: null,
  nav: null,
  position: DEFAULT_POSITION,
  destination: null,
  route: null,
  setupComplete: loadSetupComplete(),
  pairingCode: stored?.pairingCode ?? null,
  deviceId: stored?.deviceId ?? null,
  deviceToken: stored?.token ?? null,
  deviceApiKey: stored?.apiKey ?? null,
  deviceName: stored?.name ?? null,
  companionName: stored?.companionName ?? null,
  paired: stored?.paired ?? false,
  homeAddress: null,
  savedLocations: [],
  navBusy: false,
  navError: null,
  navReady: false,
  navigating: false,
  locating: false,
  usingGps: false,
  locationSource: null,
  locationError: null,
  obdConnected: false,
  speedSource: null,
  headingSource: null,
  headingOffset: 0,
  lastImuRaw: null,
  motionAvailable: false,
  motionError: null,
  motionNeedsGesture: false,
  enableMotionSensors: null,
  spotifyNeedsGesture: false,
  musicUpdatedAt: null,
  musicQueue: [],

  setMode: (mode) => set({ mode }),
  setGear: (gear) => {
    if (gear === "P") {
      set({
        gear,
        mode: "park",
        speedKmh: 0,
        navigating: false,
      });
      return;
    }
    set({
      gear,
      mode: "drive",
    });
    // Armed in Park → shifting to R/N/D begins the trip.
    const { navReady, destination, route } = get();
    if (navReady && destination && route) {
      get().startNavigation();
    }
  },
  setSpeed: (speedKmh) => set({ speedKmh, speedSource: "indev" }),
  setSpeedLimit: (speedLimitKmh) => set({ speedLimitKmh }),
  setObdConnected: (connected) => set({ obdConnected: connected }),

  setSpeedFromSensor: (speedKmh, source) => {
    const state = get();
    if (state.obdConnected && source !== "obd") return;
    set({
      speedKmh: Math.max(0, Math.round(speedKmh)),
      speedSource: source,
    });
  },

  setMotionStatus: (status) =>
    set({
      ...(status.available !== undefined
        ? { motionAvailable: status.available }
        : {}),
      ...(status.error !== undefined ? { motionError: status.error } : {}),
      ...(status.headingSource !== undefined
        ? { headingSource: status.headingSource }
        : {}),
    }),

  setConnection: (connection) => set({ connection }),
  setMusic: (music) =>
    set({
      music,
      musicUpdatedAt: music ? Date.now() : null,
      ...(music ? {} : { musicQueue: [] }),
    }),
  setMusicQueue: (musicQueue) => set({ musicQueue }),
  setSpotifyNeedsGesture: (needed) => set({ spotifyNeedsGesture: needed }),
  setNav: (nav) => set({ nav }),

  setPosition: (partial) =>
    set((state) => ({
      position: { ...state.position, ...partial },
    })),

  setHeadingFromSensor: (heading, source) => {
    const state = get();
    if (state.obdConnected && source !== "obd") return;
    // Once IMU is driving the map, GPS course / route bearing must not override.
    if (
      state.headingSource === "imu" &&
      source !== "imu" &&
      source !== "obd"
    ) {
      return;
    }
    if (source === "imu") {
      const calibrated = normalizeHeading(heading + state.headingOffset);
      set({
        position: { ...state.position, heading: calibrated },
        headingSource: "imu",
        lastImuRaw: heading,
      });
      return;
    }
    set({
      position: { ...state.position, heading: normalizeHeading(heading) },
      headingSource: source,
    });
  },

  calibrateHeadingFromGpsCourse: (courseDeg, speedKmh) => {
    const state = get();
    if (state.obdConnected) return;
    if (state.headingSource !== "imu") return;
    if (state.lastImuRaw == null) return;
    if (!(speedKmh >= 8)) return;

    // Desired offset makes (imuRaw + offset) ≈ GPS course-over-ground.
    const desiredOffset = normalizeHeading(courseDeg - state.lastImuRaw);
    const err = shortestAngleDelta(state.headingOffset, desiredOffset);
    const nextOffset = normalizeHeading(state.headingOffset + err * 0.08);
    const calibrated = normalizeHeading(state.lastImuRaw + nextOffset);
    set({
      headingOffset: nextOffset,
      position: { ...state.position, heading: calibrated },
    });
  },

  setLocationStatus: (status) =>
    set({
      ...(status.locating !== undefined ? { locating: status.locating } : {}),
      ...(status.usingGps !== undefined ? { usingGps: status.usingGps } : {}),
      ...(status.locationSource !== undefined
        ? { locationSource: status.locationSource }
        : {}),
      ...(status.error !== undefined ? { locationError: status.error } : {}),
    }),

  refreshLocation: async () => {
    set({ locating: true, locationError: null });
    try {
      const loc = await getDeviceLocationFast((interim) => {
        const state = get();
        if (state.locationSource === "gps" && interim.source === "ip") return;
        set({
          locating: interim.source !== "gps",
          usingGps: true,
          locationSource: interim.source,
          locationError: null,
          position: {
            ...state.position,
            lat: interim.lat,
            lng: interim.lng,
            ...(interim.heading != null && state.headingSource !== "imu"
              ? { heading: interim.heading }
              : {}),
          },
        });
        if (
          interim.speedMps != null &&
          interim.speedMps >= 0 &&
          !state.obdConnected
        ) {
          get().setSpeedFromSensor(interim.speedMps * 3.6, "gps");
        }
        if (interim.heading != null) {
          get().setHeadingFromSensor(interim.heading, "gps");
        }
      });
      const state = get();
      if (state.locationSource === "gps" && loc.source === "ip") {
        set({ locating: false, locationError: null });
        return;
      }
      set({
        locating: false,
        usingGps: true,
        locationSource: loc.source,
        locationError: null,
        position: {
          ...state.position,
          lat: loc.lat,
          lng: loc.lng,
          ...(loc.heading != null && state.headingSource !== "imu"
            ? { heading: loc.heading }
            : {}),
        },
      });
      if (loc.speedMps != null && loc.speedMps >= 0 && !state.obdConnected) {
        get().setSpeedFromSensor(loc.speedMps * 3.6, "gps");
      }
      if (loc.heading != null) {
        get().setHeadingFromSensor(loc.heading, "gps");
      }
    } catch (err) {
      set({
        locating: false,
        usingGps: false,
        locationSource: null,
        locationError:
          err instanceof LocationError
            ? err.message
            : "Could not get current location",
      });
    }
  },

  requestDeviceAccess: async () => {
    // Order matters: motion permission APIs must run in the same user-gesture turn on iOS.
    const enableMotion = get().enableMotionSensors;
    if (enableMotion) {
      await enableMotion();
    }
    await get().refreshLocation();
  },

  searchDestinations: async (query) => {
    const { position } = get();
    const results = await geocodePlaces(query, {
      lat: position.lat,
      lng: position.lng,
    });
    return results.map((r) => ({ name: r.name, location: r.location }));
  },

  setDestination: async (destination) => {
    if (!destination) {
      destinationRequestId += 1;
      set({
        destination: null,
        route: null,
        nav: null,
        navError: null,
        navBusy: false,
        navigating: false,
        navReady: false,
      });
      return;
    }

    const requestId = ++destinationRequestId;
    set({ navBusy: true, navError: null });
    try {
      const { position, headingSource } = get();
      const built = await buildRouteTo(position, destination);
      // Cleared or superseded while routing — do not refill destination / nav.
      if (requestId !== destinationRequestId) return;

      const current = get();
      set({
        destination,
        route: built.route,
        nav: built.nav,
        position:
          headingSource === "imu"
            ? current.position
            : { ...current.position, heading: built.heading },
        headingSource: headingSource === "imu" ? "imu" : "route",
        navBusy: false,
        navError: null,
        // Live flags after await — never revive navigating from a pre-await snapshot.
        navigating: current.navigating,
        navReady: false,
      });
    } catch (err) {
      if (requestId !== destinationRequestId) return;
      set({
        navBusy: false,
        navError:
          err instanceof Error ? err.message : "Could not build route",
      });
    }
  },

  clearDestination: () => {
    destinationRequestId += 1;
    set({
      destination: null,
      route: null,
      nav: null,
      navError: null,
      navBusy: false,
      navigating: false,
      navReady: false,
    });
  },

  armNavigation: () => {
    const { destination, route } = get();
    if (!destination || !route) return;
    set({ navReady: true, navError: null });
  },

  startNavigation: () => {
    const { destination, route } = get();
    if (!destination || !route) return;
    set({
      navigating: true,
      navReady: false,
      mode: "drive",
      navError: null,
    });
  },

  stopNavigation: () =>
    set({
      navigating: false,
      navReady: false,
    }),

  completeSetup: (device) => {
    const paired = device.paired ?? true;
    const toStore: StoredDevice = {
      ...device,
      name: device.name ?? "Porkauto Display",
      companionName: device.companionName?.trim() || undefined,
      paired,
    };
    try {
      localStorage.setItem(SETUP_KEY, "1");
      localStorage.setItem(DEVICE_KEY, JSON.stringify(toStore));
    } catch {
      // ignore
    }
    set({
      setupComplete: true,
      deviceId: device.deviceId,
      pairingCode: device.pairingCode,
      deviceToken: device.token,
      deviceApiKey: device.apiKey ?? null,
      deviceName: toStore.name ?? null,
      companionName: toStore.companionName ?? null,
      paired,
      mode: "park",
      gear: "P",
      speedKmh: 0,
      connection: readConnectionStatus(),
    });
  },

  skipSetup: () => {
    try {
      localStorage.setItem(SETUP_KEY, "1");
    } catch {
      // ignore
    }
    set({
      setupComplete: true,
      paired: false,
      mode: "park",
      gear: "P",
      speedKmh: 0,
      connection: readConnectionStatus(),
    });
  },

  resetSetup: () => {
    try {
      localStorage.removeItem(SETUP_KEY);
      localStorage.removeItem(DEVICE_KEY);
    } catch {
      // ignore
    }
    set({
      setupComplete: false,
      pairingCode: null,
      deviceId: null,
      deviceToken: null,
      deviceApiKey: null,
      deviceName: null,
      companionName: null,
      paired: false,
      homeAddress: null,
      savedLocations: [],
      mode: "park",
      gear: "P",
      speedKmh: 0,
      speedLimitKmh: null,
      connection: { type: "offline" },
  music: null,
  musicUpdatedAt: null,
  musicQueue: [],
  nav: null,
      position: DEFAULT_POSITION,
      destination: null,
      route: null,
      navBusy: false,
      navError: null,
      navigating: false,
      navReady: false,
      locating: false,
      usingGps: false,
      locationSource: null,
      locationError: null,
      obdConnected: false,
      speedSource: null,
      headingSource: null,
      headingOffset: 0,
      lastImuRaw: null,
      motionAvailable: false,
      motionError: null,
      motionNeedsGesture: false,
    });
  },

  setPairingStatus: ({
    paired,
    deviceName,
    companionName,
    homeAddress,
    savedLocations,
  }) => {
    try {
      const raw = localStorage.getItem(DEVICE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredDevice;
        localStorage.setItem(
          DEVICE_KEY,
          JSON.stringify({
            ...stored,
            paired,
            ...(deviceName ? { name: deviceName } : {}),
            ...(companionName
              ? { companionName }
              : companionName === null
                ? { companionName: undefined }
                : {}),
          }),
        );
      }
    } catch {
      // ignore
    }
    set({
      paired,
      ...(deviceName !== undefined ? { deviceName } : {}),
      ...(companionName !== undefined ? { companionName } : {}),
      ...(homeAddress !== undefined ? { homeAddress } : {}),
      ...(savedLocations !== undefined ? { savedLocations } : {}),
    });
  },

  setHomeAddress: (homeAddress) => set({ homeAddress }),
  setSavedLocations: (savedLocations) => set({ savedLocations }),
}));
