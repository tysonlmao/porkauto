import { create } from "zustand";
import {
  DEFAULT_POSITION,
  INDEV_PRESETS,
  type ActiveRoute,
  type AppMode,
  type ConnectionStatus,
  type Destination,
  type Gear,
  type MusicTrack,
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
import { readConnectionStatus } from "@/lib/networkConnection";

const SETUP_KEY = "porkauto.setupComplete";
const DEVICE_KEY = "porkauto.device";

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
  cycleIndev: () => void;
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
  setSpotifyNeedsGesture: (needed: boolean) => void;
  setNav: (nav: NavStatus | null) => void;
  setPosition: (position: Partial<VehiclePosition>) => void;
  setHeadingFromSensor: (
    heading: number,
    source: Exclude<HeadingSource, null>,
  ) => void;
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
    indevIndex: number;
    navBusy: boolean;
    navError: string | null;
    /** Active turn-by-turn follow (birds-eye camera). */
    navigating: boolean;
    locating: boolean;
    usingGps: boolean;
    locationSource: LocationSource | null;
    locationError: string | null;
    obdConnected: boolean;
    speedSource: SpeedSource;
    headingSource: HeadingSource;
  motionAvailable: boolean;
  motionError: string | null;
  motionNeedsGesture: boolean;
  enableMotionSensors: (() => Promise<boolean>) | null;
  /** Browser blocked Spotify Web Playback autoplay until a user tap. */
  spotifyNeedsGesture: boolean;
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
  mode: "connecting",
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
  indevIndex: 0,
  navBusy: false,
  navError: null,
  navigating: false,
  locating: false,
  usingGps: false,
  locationSource: null,
  locationError: null,
  obdConnected: false,
  speedSource: null,
  headingSource: null,
  motionAvailable: false,
  motionError: null,
  motionNeedsGesture: false,
  enableMotionSensors: null,
  spotifyNeedsGesture: false,

  cycleIndev: () => {
    const next = (get().indevIndex + 1) % INDEV_PRESETS.length;
    const preset = INDEV_PRESETS[next];
    if (!preset) return;
    const { connection: _ignored, ...rest } = preset;
    set({
      indevIndex: next,
      ...rest,
      // Connection comes from the live network hook, not indev presets.
      connection: get().connection,
    });
  },

  setMode: (mode) => set({ mode }),
  setGear: (gear) => set({ gear }),
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
  setMusic: (music) => set({ music }),
  setSpotifyNeedsGesture: (needed) => set({ spotifyNeedsGesture: needed }),
  setNav: (nav) => set({ nav }),

  setPosition: (partial) =>
    set((state) => ({
      position: { ...state.position, ...partial },
    })),

  setHeadingFromSensor: (heading, source) => {
    const state = get();
    if (state.obdConnected && source !== "obd") return;
    // IMU compass preferred over GPS course when both exist
    if (source === "gps" && state.headingSource === "imu") return;
    set({
      position: { ...state.position, heading },
      headingSource: source,
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
      set({
        destination: null,
        route: null,
        nav: null,
        navError: null,
        navBusy: false,
        navigating: false,
      });
      return;
    }

    set({ navBusy: true, navError: null });
    try {
      const { position, headingSource, navigating } = get();
      const built = await buildRouteTo(position, destination);
      set({
        destination,
        route: built.route,
        nav: built.nav,
        position:
          headingSource === "imu"
            ? position
            : { ...position, heading: built.heading },
        headingSource: headingSource === "imu" ? "imu" : "route",
        navBusy: false,
        navError: null,
        navigating,
      });
    } catch (err) {
      set({
        navBusy: false,
        navError:
          err instanceof Error ? err.message : "Could not build route",
      });
    }
  },

  clearDestination: () =>
    set({
      destination: null,
      route: null,
      nav: null,
      navError: null,
      navigating: false,
    }),

  startNavigation: () => {
    const { destination, route } = get();
    if (!destination || !route) return;
    set({
      navigating: true,
      mode: "drive",
      gear: "D",
      navError: null,
    });
  },

  stopNavigation: () =>
    set({
      navigating: false,
      mode: "park",
      gear: "P",
      speedKmh: 0,
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
      mode: "connecting",
      gear: "P",
      speedKmh: 0,
      speedLimitKmh: null,
      connection: { type: "offline" },
      music: null,
      nav: null,
      position: DEFAULT_POSITION,
      destination: null,
      route: null,
      navBusy: false,
      navError: null,
      navigating: false,
      locating: false,
      usingGps: false,
      locationSource: null,
      locationError: null,
      obdConnected: false,
      speedSource: null,
      headingSource: null,
      motionAvailable: false,
      motionError: null,
      motionNeedsGesture: false,
      indevIndex: 0,
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
