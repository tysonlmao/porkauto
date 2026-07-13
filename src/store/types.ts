export type AppMode = "park" | "drive";
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

export type MusicQueueItem = {
  title: string;
  artist: string;
  albumArtUrl: string | null;
};

export type NavStatus = {
  etaTime: string;
  remainingMinutes: number;
  destination: string;
  /** Live remaining path length along the active route (meters). */
  remainingDistanceM?: number;
  /** True when vehicle is farther from the route than the off-route threshold. */
  offRoute?: boolean;
};

/** Host / companion display appearance (DeviceConfig.theme). */
export type DisplayThemeMode = "dark" | "light" | "system" | "daylight";

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
  /** From companion / host settings — destination shortcut. */
  homeAddress: string | null;
  /** Saved places (local and/or companion config). */
  savedLocations: SavedLocation[];
  /** Appearance preference (synced via DeviceConfig.theme when paired). */
  displayTheme: DisplayThemeMode;
};

export const GEARS: Gear[] = ["P", "R", "N", "D"];

/** Default “you are here” — Sydney CBD */
export const DEFAULT_POSITION: VehiclePosition = {
  lat: -33.8688,
  lng: 151.2093,
  heading: 220,
};