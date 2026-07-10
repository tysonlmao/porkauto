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

export type VehiclePosition = LatLng & {
  heading: number;
};

export type ActiveRoute = {
  coordinates: LatLng[];
  durationSec: number;
  distanceM: number;
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
    },
    nav: {
      etaTime: "09:12",
      remainingMinutes: 18,
      destination: "Home",
    },
  },
];
