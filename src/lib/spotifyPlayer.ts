import { apiBase } from "./api";
import type { MusicTrack } from "@/store/types";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

type SpotifyPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  activateElement: () => Promise<void>;
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  getCurrentState: () => Promise<SpotifyPlaybackState | null>;
  addListener: (
    event: string,
    cb: (...args: unknown[]) => void,
  ) => boolean;
  removeListener: (event: string, cb?: (...args: unknown[]) => void) => void;
};

type ErrorState = { message: string };
type ReadyState = { device_id: string };

type SpotifyPlaybackState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album: { images: Array<{ url: string }> };
    } | null;
  };
};

export type SpotifyPlayerHandle = {
  disconnect: () => void;
  activateAudio: () => Promise<void>;
  spotifyDeviceId: () => string | null;
  previous: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
};

function loadSdkScript(): Promise<void> {
  if (window.Spotify) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-spotify-sdk="1"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Spotify SDK")),
      );
      return;
    }

    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      prev?.();
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.dataset.spotifySdk = "1";
    script.onerror = () => reject(new Error("Failed to load Spotify SDK"));
    document.body.appendChild(script);
  });
}

export async function fetchSpotifyAccessToken(
  deviceId: string,
  credential: string,
): Promise<string> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/token`,
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Spotify token failed (${res.status})`);
  }
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

export async function fetchSpotifyLinkStatus(
  deviceId: string,
  credential: string,
): Promise<{ linked: boolean; displayName: string | null }> {
  const res = await fetch(`${apiBase()}/devices/${deviceId}/integrations`, {
    headers: { Authorization: `Bearer ${credential}` },
  });
  if (!res.ok) {
    return { linked: false, displayName: null };
  }
  const data = (await res.json()) as {
    services: Array<{
      provider: string;
      status: string;
      displayName: string | null;
    }>;
  };
  const spotify = data.services.find((s) => s.provider === "spotify");
  return {
    linked: spotify?.status === "linked",
    displayName: spotify?.displayName ?? null,
  };
}

/** Account-wide now-playing (any Connect device / phone). */
export async function fetchSpotifyNowPlaying(
  deviceId: string,
  credential: string,
): Promise<MusicTrack | null> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/player`,
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    playing: boolean;
    track: MusicTrack | null;
  };
  if (!data.track) return null;
  return {
    ...data.track,
    isPlaying: data.track.isPlaying ?? data.playing,
  };
}

export type SpotifyQueueItem = {
  title: string;
  artist: string;
  albumArtUrl: string | null;
};

export async function fetchSpotifyQueue(
  deviceId: string,
  credential: string,
): Promise<SpotifyQueueItem[]> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/queue`,
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { queue?: SpotifyQueueItem[] };
  return data.queue ?? [];
}

async function transferToDevice(
  deviceId: string,
  credential: string,
  spotifyDeviceId: string,
  play = true,
): Promise<void> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/transfer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spotifyDeviceId, play }),
    },
  );
  if (!res.ok && res.status !== 404) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Spotify transfer failed (${res.status})`);
  }
}

export type SpotifyControlAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "toggle";

export async function sendSpotifyControl(
  deviceId: string,
  credential: string,
  action: SpotifyControlAction,
  currentlyPlaying?: boolean,
): Promise<void> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/control`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, currentlyPlaying }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Spotify control failed (${res.status})`);
  }
}

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  uri: string;
};

export async function fetchSpotifyPlaylists(
  deviceId: string,
  credential: string,
): Promise<SpotifyPlaylistSummary[]> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/playlists`,
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Spotify playlists failed (${res.status})`);
  }
  const data = (await res.json()) as { playlists?: SpotifyPlaylistSummary[] };
  return data.playlists ?? [];
}

export async function playSpotifyContext(
  deviceId: string,
  credential: string,
  contextUri: string,
  spotifyDeviceId?: string | null,
): Promise<void> {
  const res = await fetch(
    `${apiBase()}/devices/${deviceId}/integrations/spotify/play`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contextUri,
        ...(spotifyDeviceId ? { spotifyDeviceId } : {}),
      }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Spotify play failed (${res.status})`);
  }
}

/** Active SDK handle for transport when Porkauto is the Connect device. */
let activePlayerHandle: SpotifyPlayerHandle | null = null;

export function getActiveSpotifyPlayer(): SpotifyPlayerHandle | null {
  return activePlayerHandle;
}

export function setActiveSpotifyPlayer(
  handle: SpotifyPlayerHandle | null,
): void {
  activePlayerHandle = handle;
}

function trackFromState(state: SpotifyPlaybackState): MusicTrack | null {
  const track = state.track_window.current_track;
  if (!track) return null;
  return {
    title: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    albumArtUrl: track.album.images[0]?.url ?? null,
    progressMs: state.position,
    durationMs: track.duration_ms || state.duration,
    isPlaying: !state.paused,
  };
}

/**
 * Connect Web Playback SDK as Connect device "Porkauto".
 * Handles browser autoplay (activateElement) and transfers playback on ready.
 */
export async function startSpotifyPlayer(options: {
  deviceId: string;
  credential: string;
  onTrack: (track: MusicTrack | null) => void;
  onError?: (message: string) => void;
  onReady?: (spotifyDeviceId: string) => void;
  /** Browser blocked autoplay — UI should prompt for a tap. */
  onNeedsGesture?: (needed: boolean) => void;
}): Promise<SpotifyPlayerHandle> {
  await loadSdkScript();
  if (!window.Spotify) {
    throw new Error("Spotify Web Playback SDK unavailable");
  }

  let latestToken = await fetchSpotifyAccessToken(
    options.deviceId,
    options.credential,
  );
  let spotifyDeviceId: string | null = null;
  let audioActivated = false;
  let disposed = false;
  /** Resume once after Connect transfer (autoplay often lands paused). */
  let resumeAfterTransfer = false;

  const player = new window.Spotify.Player({
    name: "Porkauto",
    getOAuthToken: (cb) => {
      void (async () => {
        try {
          latestToken = await fetchSpotifyAccessToken(
            options.deviceId,
            options.credential,
          );
          cb(latestToken);
        } catch (err) {
          options.onError?.(
            err instanceof Error ? err.message : "Spotify auth failed",
          );
          cb(latestToken);
        }
      })();
    },
    volume: 0.8,
  });

  const activateAudio = async (opts?: { resumeIfPaused?: boolean }) => {
    try {
      await player.activateElement();
      audioActivated = true;
      options.onNeedsGesture?.(false);
      // Only auto-resume for gesture unlock / transfer recovery — never from
      // transport controls, or pause→play would resume then togglePlay pause again.
      if (opts?.resumeIfPaused) {
        const state = await player.getCurrentState();
        if (state?.paused) {
          await player.resume();
        }
      }
    } catch (err) {
      console.warn(
        "[spotify] activateElement failed:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  const onUserGesture = () => {
    if (disposed || audioActivated) return;
    void activateAudio({ resumeIfPaused: true });
  };

  // Capture a user gesture early so transfer from the Spotify app can play audio.
  document.addEventListener("pointerdown", onUserGesture, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", onUserGesture, {
    capture: true,
    passive: true,
  });

  player.addListener("initialization_error", (raw) => {
    options.onError?.((raw as ErrorState).message);
  });
  player.addListener("authentication_error", (raw) => {
    options.onError?.((raw as ErrorState).message);
  });
  player.addListener("account_error", (raw) => {
    options.onError?.(
      (raw as ErrorState).message || "Spotify Premium is required",
    );
  });
  player.addListener("playback_error", (raw) => {
    options.onError?.((raw as ErrorState).message);
  });
  player.addListener("autoplay_failed", () => {
    audioActivated = false;
    options.onNeedsGesture?.(true);
    options.onError?.(
      "Tap the display to enable Spotify audio (browser autoplay block)",
    );
  });

  player.addListener("ready", (raw) => {
    const id = (raw as ReadyState).device_id;
    spotifyDeviceId = id;
    options.onReady?.(id);

    void (async () => {
      // Best-effort activate (works when the webview allows autoplay).
      try {
        await player.activateElement();
        audioActivated = true;
        options.onNeedsGesture?.(false);
      } catch {
        options.onNeedsGesture?.(true);
      }

      try {
        await player.setVolume(0.8);
      } catch {
        // ignore
      }

      try {
        await transferToDevice(
          options.deviceId,
          options.credential,
          id,
          true,
        );
        resumeAfterTransfer = true;
      } catch (err) {
        console.warn(
          "[spotify] transfer on ready:",
          err instanceof Error ? err.message : err,
        );
      }

      // Give Connect a moment, then resume local SDK playback.
      await new Promise((r) => setTimeout(r, 400));
      try {
        await player.resume();
        resumeAfterTransfer = false;
      } catch {
        // Autoplay may still block until a gesture.
      }

      const state = await player.getCurrentState();
      if (state) options.onTrack(trackFromState(state));
    })();
  });

  player.addListener("player_state_changed", (raw) => {
    const state = raw as SpotifyPlaybackState | null;
    if (!state) return;
    options.onTrack(trackFromState(state));

    if (
      resumeAfterTransfer &&
      state.paused &&
      audioActivated &&
      state.track_window.current_track
    ) {
      resumeAfterTransfer = false;
      void player.resume().catch(() => undefined);
    }
  });

  const ok = await player.connect();
  if (!ok) {
    document.removeEventListener("pointerdown", onUserGesture, true);
    document.removeEventListener("keydown", onUserGesture, true);
    throw new Error("Could not connect Spotify player");
  }

  return {
    spotifyDeviceId: () => spotifyDeviceId,
    activateAudio: () => activateAudio(),
    previous: async () => {
      await activateAudio();
      await player.previousTrack();
    },
    pause: async () => {
      await activateAudio();
      await player.pause();
    },
    resume: async () => {
      await activateAudio();
      await player.resume();
    },
    togglePlay: async () => {
      await activateAudio();
      const state = await player.getCurrentState();
      if (state?.paused) {
        await player.resume();
      } else {
        await player.pause();
      }
    },
    next: async () => {
      await activateAudio();
      await player.nextTrack();
    },
    disconnect: () => {
      disposed = true;
      document.removeEventListener("pointerdown", onUserGesture, true);
      document.removeEventListener("keydown", onUserGesture, true);
      player.disconnect();
    },
  };
}
