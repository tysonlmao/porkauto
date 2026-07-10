const SPOTIFY_AUTH = "https://accounts.spotify.com";
const SPOTIFY_API = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
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
  // 204 success; 404 = no active device
  if (status === 204 || status === 404) return;
  if (status < 200 || status >= 300) {
    throw new Error(`Spotify ${resolved} failed (${status}): ${text}`);
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  // Spotify does not expose a public revoke endpoint for user tokens;
  // best-effort: ignore failures after we delete local credentials.
  void refreshToken;
}
