const SPOTIFY_AUTH = "https://accounts.spotify.com";
const SPOTIFY_API = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-recently-played",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  email?: string;
};

export type SpotifyPlaybackState = {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    artists: Array<{ name: string }>;
    duration_ms: number;
    album: {
      images: Array<{ url: string; width?: number; height?: number }>;
    };
  } | null;
};

type FetchLike = {
  status?: number;
  text: () => Promise<string>;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function spotifyConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
      process.env.SPOTIFY_CLIENT_SECRET?.trim(),
  );
}

export function getSpotifyClientId(): string {
  return requireEnv("SPOTIFY_CLIENT_ID");
}

/**
 * Spotify Redirect URI registered in the Developer Dashboard.
 * Must match exactly. Custom scheme works with the Android companion
 * (`porkauto://oauth/spotify` → app calls /complete). HTTPS tunnel
 * URLs work via the server callback route instead.
 */
export function getSpotifyRedirectUri(): string {
  return (
    process.env.SPOTIFY_REDIRECT_URI?.trim() || "porkauto://oauth/spotify"
  );
}

export function getSpotifyAndroidRedirect(): string {
  return (
    process.env.SPOTIFY_ANDROID_REDIRECT?.trim() || "porkauto://oauth/spotify"
  );
}

function basicAuthHeader(): string {
  const id = requireEnv("SPOTIFY_CLIENT_ID");
  const secret = requireEnv("SPOTIFY_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function spotifyFetch(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; text: string }> {
  const response = (await fetch(url, init)) as unknown as FetchLike;
  const status = Number(response.status ?? 0);
  const text = await response.text();
  return { status, text };
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getSpotifyClientId(),
    response_type: "code",
    redirect_uri: getSpotifyRedirectUri(),
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "true",
  });
  return `${SPOTIFY_AUTH}/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(
  code: string,
): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getSpotifyRedirectUri(),
  });

  const { status, text } = await spotifyFetch(`${SPOTIFY_AUTH}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Spotify token exchange failed (${status}): ${text}`);
  }

  return JSON.parse(text) as SpotifyTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const { status, text } = await spotifyFetch(`${SPOTIFY_AUTH}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Spotify token refresh failed (${status}): ${text}`);
  }

  return JSON.parse(text) as SpotifyTokenResponse;
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<SpotifyProfile> {
  const { status, text } = await spotifyFetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify profile failed (${status}): ${text}`);
  }
  return JSON.parse(text) as SpotifyProfile;
}

export async function fetchPlaybackState(
  accessToken: string,
): Promise<SpotifyPlaybackState | null> {
  const { status, text } = await spotifyFetch(`${SPOTIFY_API}/me/player`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (status === 204 || !text.trim()) return null;
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify player failed (${status}): ${text}`);
  }
  return JSON.parse(text) as SpotifyPlaybackState;
}

export type SpotifyQueueTrack = {
  title: string;
  artist: string;
  albumArtUrl: string | null;
};

/** Next tracks in the player queue (Premium). */
export async function fetchPlaybackQueue(
  accessToken: string,
  limit = 3,
): Promise<SpotifyQueueTrack[]> {
  const { status, text } = await spotifyFetch(
    `${SPOTIFY_API}/me/player/queue`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (status === 204 || !text.trim()) return [];
  if (status === 403 || status === 404) return [];
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify queue failed (${status}): ${text}`);
  }

  const data = JSON.parse(text) as {
    queue?: Array<{
      name?: string;
      artists?: Array<{ name: string }>;
      album?: { images?: Array<{ url: string; width?: number }> };
    } | null>;
  };

  return (data.queue ?? [])
    .filter((t): t is NonNullable<typeof t> => Boolean(t?.name))
    .slice(0, Math.max(0, limit))
    .map((t) => {
      const images = t.album?.images ?? [];
      const art =
        [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0]?.url ??
        images[0]?.url ??
        null;
      return {
        title: t.name ?? "Unknown",
        artist: (t.artists ?? []).map((a) => a.name).join(", ") || "Unknown",
        albumArtUrl: art,
      };
    });
}

export type SpotifyConnectDevice = {
  id: string;
  name: string;
  isActive: boolean;
  type: string | null;
};

/** List Connect devices available to this account. */
export async function fetchSpotifyDevices(
  accessToken: string,
): Promise<SpotifyConnectDevice[]> {
  const { status, text } = await spotifyFetch(
    `${SPOTIFY_API}/me/player/devices`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify devices failed (${status}): ${text}`);
  }
  const data = JSON.parse(text) as {
    devices?: Array<{
      id?: string | null;
      name?: string;
      is_active?: boolean;
      type?: string;
    }>;
  };
  return (data.devices ?? [])
    .filter((d): d is { id: string; name?: string; is_active?: boolean; type?: string } =>
      Boolean(d.id),
    )
    .map((d) => ({
      id: d.id,
      name: d.name?.trim() || "Unknown",
      isActive: Boolean(d.is_active),
      type: d.type ?? null,
    }));
}

/**
 * Prefer the Web Playback SDK device named "Porkauto" (host display).
 * Falls back to the first name match containing "porkauto".
 */
export async function resolvePorkautoSpotifyDeviceId(
  accessToken: string,
): Promise<string | null> {
  const devices = await fetchSpotifyDevices(accessToken);
  const exact = devices.find((d) => d.name.toLowerCase() === "porkauto");
  if (exact) return exact.id;
  const loose = devices.find((d) => /porkauto/i.test(d.name));
  return loose?.id ?? null;
}

/** Move Connect playback onto a Web Playback SDK device. */
export async function transferPlayback(
  accessToken: string,
  spotifyDeviceId: string,
  play = true,
): Promise<void> {
  const { status, text } = await spotifyFetch(`${SPOTIFY_API}/me/player`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_ids: [spotifyDeviceId],
      play,
    }),
  });
  // 204 success; 404 = nothing to transfer (no active context) — not fatal
  if (status === 204 || status === 404) return;
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify transfer failed (${status}): ${text}`);
  }
}

export type SpotifyControlAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "toggle";

/** Account-wide player controls (works for any active Connect device). */
export async function controlPlayback(
  accessToken: string,
  action: SpotifyControlAction,
  currentlyPlaying?: boolean,
): Promise<void> {
  let resolved: Exclude<SpotifyControlAction, "toggle"> = action as Exclude<
    SpotifyControlAction,
    "toggle"
  >;
  if (action === "toggle") {
    resolved = currentlyPlaying ? "pause" : "play";
  }

  const path =
    resolved === "play"
      ? "/me/player/play"
      : resolved === "pause"
        ? "/me/player/pause"
        : resolved === "next"
          ? "/me/player/next"
          : "/me/player/previous";

  const method = resolved === "next" || resolved === "previous" ? "POST" : "PUT";

  const { status, text } = await spotifyFetch(`${SPOTIFY_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (status === 204) return;
  if (status === 404) {
    throw new Error("No active Spotify device — open Spotify or transfer playback");
  }
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify ${resolved} failed (${status}): ${text}`);
  }
}

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  uri: string;
};

/** Map playlist URI → most recent play timestamp (ms). Best-effort via recently-played. */
async function fetchPlaylistLastPlayedAt(
  accessToken: string,
): Promise<Map<string, number>> {
  const lastPlayed = new Map<string, number>();
  try {
    const { status, text } = await spotifyFetch(
      `${SPOTIFY_API}/me/player/recently-played?limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (status < 200 || status >= 300) return lastPlayed;

    const data = JSON.parse(text) as {
      items?: Array<{
        played_at?: string;
        context?: { type?: string; uri?: string } | null;
      }>;
    };

    for (const item of data.items ?? []) {
      const uri = item.context?.uri;
      if (!uri?.startsWith("spotify:playlist:")) continue;
      const playedAt = item.played_at ? Date.parse(item.played_at) : NaN;
      if (!Number.isFinite(playedAt)) continue;
      const prev = lastPlayed.get(uri);
      if (prev == null || playedAt > prev) {
        lastPlayed.set(uri, playedAt);
      }
    }
  } catch {
    // Sorting is best-effort; fall back to Spotify's default order.
  }
  return lastPlayed;
}

export async function fetchUserPlaylists(
  accessToken: string,
  limit = 30,
): Promise<SpotifyPlaylistSummary[]> {
  const [{ status, text }, lastPlayed] = await Promise.all([
    spotifyFetch(
      `${SPOTIFY_API}/me/playlists?limit=${Math.min(50, Math.max(1, limit))}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
    fetchPlaylistLastPlayedAt(accessToken),
  ]);

  if (status < 200 || status >= 300) {
    throw new Error(`Spotify playlists failed (${status}): ${text}`);
  }
  const data = JSON.parse(text) as {
    items?: Array<{
      id: string;
      name: string;
      uri: string;
      images?: Array<{ url: string }>;
      tracks?: { total?: number };
    } | null>;
  };

  const playlists = (data.items ?? [])
    .filter((item): item is NonNullable<typeof item> =>
      Boolean(item?.id && item?.uri),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      uri: item.uri,
      imageUrl: item.images?.[0]?.url ?? null,
      trackCount: item.tracks?.total ?? 0,
    }));

  return playlists.sort((a, b) => {
    const aAt = lastPlayed.get(a.uri) ?? 0;
    const bAt = lastPlayed.get(b.uri) ?? 0;
    if (aAt !== bAt) return bAt - aAt;
    return a.name.localeCompare(b.name);
  });
}

/** Start playback of a playlist/album/context on the active (or specified) device. */
export async function playContextUri(
  accessToken: string,
  contextUri: string,
  spotifyDeviceId?: string,
): Promise<void> {
  const url = new URL(`${SPOTIFY_API}/me/player/play`);
  if (spotifyDeviceId) {
    url.searchParams.set("device_id", spotifyDeviceId);
  }

  const { status, text } = await spotifyFetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ context_uri: contextUri }),
  });
  if (status === 204 || status === 202) return;
  if (status === 404) {
    throw new Error(
      "No active Spotify device — open Spotify or tap to enable audio on this display",
    );
  }
  if (status === 403) {
    throw new Error(
      text.includes("Restriction") || text.includes("premium")
        ? "Spotify Premium is required to play this playlist"
        : `Spotify denied playback (${text || "forbidden"})`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new Error(
      text?.trim()
        ? `Spotify play failed (${status}): ${text.slice(0, 200)}`
        : `Spotify play failed (${status})`,
    );
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  // Spotify does not expose a public revoke endpoint for user tokens;
  // best-effort: ignore failures after we delete local credentials.
  void refreshToken;
}
