export type AppMode = "connecting" | "park" | "drive";
export type Gear = "P" | "R" | "N" | "D";
export type SignalBars = 0 | 1 | 2 | 3 | 4;

export type LatLng = { lat: number; lng: number };

export type ConnectionStatus =
  | { type: "wifi"; bars: SignalBars }
  | { type: "ethernet" }
  | { type: "cellular"; generation: "4G" | "5G"; bars: SignalBars }
  | { type: "offline" };

export type MusicTrack = {
  title: string;
  artist: string;
  albumArtUrl: string | null;
  /** Playback position in ms when this snapshot was taken. */
  progressMs?: number;
  /** Track duration in ms. */
  durationMs?: number;
  /** Whether Spotify reports the track as currently playing. */
  isPlaying?: boolean;
};

export type NavStatus = {
  etaTime: string;
  remainingMinutes: number;
  destination: string;
};

export type Destination = {
  name: string;
  location: LatLng;
};

export type SavedLocation = {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
};

export type VehiclePosition = LatLng & {
  heading: number;
};

export type RouteStep = {
  instruction: string;
  distanceM: number;
  durationSec: number;
  location: LatLng;
  type: string;
  modifier?: string;
};

export type ActiveRoute = {
  coordinates: LatLng[];
  durationSec: number;
  distanceM: number;
  steps: RouteStep[];
};

export type VehicleState = {
  mode: AppMode;
  gear: Gear;
  speedKmh: number;
  speedLimitKmh: number | null;
  connection: ConnectionStatus;
  music: MusicTrack | null;
  nav: NavStatus | null;
  position: VehiclePosition;
  destination: Destination | null;
  route: ActiveRoute | null;
  setupComplete: boolean;
  pairingCode: string | null;
  deviceId: string | null;
  deviceToken: string | null;
  deviceApiKey: string | null;
  /** Registered display name. */
  deviceName: string | null;
  /** Phone/tablet that claimed this display — shown as “Paired to …”. */
  companionName: string | null;
  paired: boolean;
  /** From companion device config — used as destination shortcut. */
  homeAddress: string | null;
  /** Saved places from companion config. */
  savedLocations: SavedLocation[];
};

export const GEARS: Gear[] = ["P", "R", "N", "D"];

/** Default “you are here” — Sydney CBD */
export const DEFAULT_POSITION: VehiclePosition = {
  lat: -33.8688,
  lng: 151.2093,
  heading: 220,
};

export const INDEV_PRESETS: Omit<
  VehicleState,
  | "setupComplete"
  | "pairingCode"
  | "deviceId"
  | "deviceToken"
  | "deviceApiKey"
  | "deviceName"
  | "companionName"
  | "paired"
  | "homeAddress"
  | "savedLocations"
  | "position"
  | "destination"
  | "route"
>[] = [
  {
    mode: "connecting",
    gear: "P",
    speedKmh: 0,
    speedLimitKmh: null,
    connection: { type: "offline" },
    music: null,
    nav: null,
  },
  {
    mode: "park",
    gear: "P",
    speedKmh: 0,
    speedLimitKmh: null,
    connection: { type: "wifi", bars: 3 },
    music: null,
    nav: null,
  },
  {
    mode: "drive",
    gear: "D",
    speedKmh: 112,
    speedLimitKmh: 110,
    connection: { type: "cellular", generation: "5G", bars: 4 },
    music: {
      title: "Vanished",
      artist: "Crystal Castles",
      albumArtUrl: null,
      progressMs: 72_000,
      durationMs: 214_000,
      isPlaying: true,
    },
    nav: {
      etaTime: "14:24",
      remainingMinutes: 5,
      destination: "420 South Road",
    },
  },
  {
    mode: "drive",
    gear: "D",
    speedKmh: 48,
    speedLimitKmh: 50,
    connection: { type: "ethernet" },
    music: {
      title: "Nightcall",
      artist: "Kavinsky",
      albumArtUrl: null,
      progressMs: 45_000,
      durationMs: 256_000,
      isPlaying: true,
    },
    nav: {
      etaTime: "09:12",
      remainingMinutes: 18,
      destination: "Home",
    },
  },
];
