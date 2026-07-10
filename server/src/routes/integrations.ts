import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { deviceIntegrations, devices } from "../db/schema";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchPlaybackState,
  fetchSpotifyProfile,
  getSpotifyAndroidRedirect,
  getSpotifyRedirectUri,
  refreshAccessToken,
  spotifyConfigured,
  transferPlayback,
  controlPlayback,
  type SpotifyControlAction,
  type SpotifyTokenResponse,
} from "../lib/spotify";
import {
  canAccessDevice,
  isDeviceConfirmed,
  requireAuth,
  type AuthVariables,
} from "../middleware/auth";

type OAuthPending = {
  deviceId: string;
  createdAt: number;
};

/** Short-lived CSRF state for Spotify OAuth (in-memory). */
const pendingOAuth = new Map<string, OAuthPending>();
const OAUTH_TTL_MS = 10 * 60 * 1000;

function prunePending() {
  const now = Date.now();
  for (const [state, row] of pendingOAuth) {
    if (now - row.createdAt > OAUTH_TTL_MS) pendingOAuth.delete(state);
  }
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadDeviceOrThrow(id: string) {
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
  });
  if (!device) {
    throw new HTTPException(404, { message: "Device not found" });
  }
  return device;
}

async function requireDeviceAccess(
  auth: { typ: string; sub: string },
  deviceId: string,
) {
  const device = await loadDeviceOrThrow(deviceId);
  if (!canAccessDevice(auth as never, device)) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }
  return device;
}

async function persistSpotifyTokens(
  deviceId: string,
  tokens: SpotifyTokenResponse,
) {
  const profile = await fetchSpotifyProfile(tokens.access_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const displayName =
    profile.display_name?.trim() || profile.email || profile.id;

  const existing = await db.query.deviceIntegrations.findFirst({
    where: and(
      eq(deviceIntegrations.deviceId, deviceId),
      eq(deviceIntegrations.provider, "spotify"),
    ),
  });

  if (existing) {
    await db
      .update(deviceIntegrations)
      .set({
        status: "linked",
        spotifyUserId: profile.id,
        displayName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing.refreshToken,
        scope: tokens.scope,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(deviceIntegrations.id, existing.id));
  } else {
    if (!tokens.refresh_token) {
      throw new HTTPException(400, { message: "missing_refresh_token" });
    }
    await db.insert(deviceIntegrations).values({
      deviceId,
      provider: "spotify",
      status: "linked",
      spotifyUserId: profile.id,
      displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      expiresAt,
    });
  }

  return { displayName, spotifyUserId: profile.id };
}

async function getValidSpotifyAccessToken(deviceId: string): Promise<{
  accessToken: string;
  expiresAt: Date | null;
  displayName: string | null;
}> {
  const row = await db.query.deviceIntegrations.findFirst({
    where: and(
      eq(deviceIntegrations.deviceId, deviceId),
      eq(deviceIntegrations.provider, "spotify"),
    ),
  });

  if (!row || row.status !== "linked" || !row.accessToken) {
    throw new HTTPException(404, { message: "Spotify is not linked" });
  }

  const expiresAt = row.expiresAt?.getTime() ?? 0;
  const stillValid = expiresAt > Date.now() + 60_000;

  if (stillValid) {
    return {
      accessToken: row.accessToken,
      expiresAt: row.expiresAt,
      displayName: row.displayName,
    };
  }

  if (!row.refreshToken) {
    throw new HTTPException(401, {
      message: "Spotify session expired — re-link from the companion app",
    });
  }

  const tokens = await refreshAccessToken(row.refreshToken);
  const nextExpires = new Date(Date.now() + tokens.expires_in * 1000);
  const nextRefresh = tokens.refresh_token ?? row.refreshToken;

  await db
    .update(deviceIntegrations)
    .set({
      accessToken: tokens.access_token,
      refreshToken: nextRefresh,
      scope: tokens.scope ?? row.scope,
      expiresAt: nextExpires,
      updatedAt: new Date(),
    })
    .where(eq(deviceIntegrations.id, row.id));

  return {
    accessToken: tokens.access_token,
    expiresAt: nextExpires,
    displayName: row.displayName,
  };
}

/** Device-scoped integration routes: /devices/:id/integrations… */
export const deviceIntegrationRoutes = new Hono<{ Variables: AuthVariables }>();

deviceIntegrationRoutes.get("/:id/integrations", requireAuth, async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  await requireDeviceAccess(auth, id);

  const rows = await db.query.deviceIntegrations.findMany({
    where: eq(deviceIntegrations.deviceId, id),
  });

  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const spotify = byProvider.get("spotify");

  const services = [
    {
      provider: "spotify" as const,
      status:
        spotify?.status === "linked"
          ? ("linked" as const)
          : ("unlinked" as const),
      displayName: spotify?.status === "linked" ? spotify.displayName : null,
      configured: spotifyConfigured(),
      redirectUri: getSpotifyRedirectUri(),
    },
  ];

  return c.json({ services });
});

deviceIntegrationRoutes.post(
  "/:id/integrations/spotify/start",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    if (auth.typ !== "owner") {
      throw new HTTPException(403, {
        message: "Owner authentication required to link Spotify",
      });
    }

    const device = await requireDeviceAccess(auth, id);
    if (!isDeviceConfirmed(device)) {
      throw new HTTPException(403, {
        message: "Pairing must be confirmed before linking services",
      });
    }

    if (!spotifyConfigured()) {
      throw new HTTPException(503, {
        message:
          "Spotify is not configured on the server (SPOTIFY_CLIENT_ID / SECRET)",
      });
    }

    prunePending();
    const state = randomState();
    pendingOAuth.set(state, { deviceId: id, createdAt: Date.now() });

    return c.json({
      authorizeUrl: buildAuthorizeUrl(state),
      state,
      redirectUri: getSpotifyRedirectUri(),
    });
  },
);

/**
 * Complete OAuth after Spotify redirects to porkauto://oauth/spotify?code&state
 * (custom-scheme redirect — no HTTPS server callback required).
 */
deviceIntegrationRoutes.post(
  "/:id/integrations/spotify/complete",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    if (auth.typ !== "owner") {
      throw new HTTPException(403, {
        message: "Owner authentication required to link Spotify",
      });
    }
    await requireDeviceAccess(auth, id);

    const body = await c.req.json<{ code?: string; state?: string }>();
    const code = body.code?.trim();
    const state = body.state?.trim();
    if (!code || !state) {
      throw new HTTPException(400, { message: "code and state are required" });
    }

    prunePending();
    const pending = pendingOAuth.get(state);
    pendingOAuth.delete(state);
    if (!pending || pending.deviceId !== id) {
      throw new HTTPException(400, {
        message: "invalid_or_expired_state",
      });
    }

    try {
      const tokens = await exchangeAuthorizationCode(code);
      const linked = await persistSpotifyTokens(id, tokens);
      return c.json({
        ok: true,
        provider: "spotify",
        status: "linked",
        displayName: linked.displayName,
      });
    } catch (err) {
      console.error("Spotify OAuth complete failed:", err);
      if (err instanceof HTTPException) throw err;
      throw new HTTPException(502, { message: "token_exchange_failed" });
    }
  },
);

deviceIntegrationRoutes.delete(
  "/:id/integrations/spotify",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    if (auth.typ !== "owner" && auth.typ !== "device") {
      throw new HTTPException(403, { message: "Not authorized" });
    }
    await requireDeviceAccess(auth, id);

    await db
      .delete(deviceIntegrations)
      .where(
        and(
          eq(deviceIntegrations.deviceId, id),
          eq(deviceIntegrations.provider, "spotify"),
        ),
      );

    return c.json({ ok: true, provider: "spotify", status: "unlinked" });
  },
);

deviceIntegrationRoutes.get(
  "/:id/integrations/spotify/token",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    if (auth.typ !== "device") {
      throw new HTTPException(403, {
        message: "Device authentication required for Spotify playback token",
      });
    }
    await requireDeviceAccess(auth, id);

    const { accessToken, expiresAt } = await getValidSpotifyAccessToken(id);
    return c.json({
      accessToken,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  },
);

deviceIntegrationRoutes.get(
  "/:id/integrations/spotify/player",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    await requireDeviceAccess(auth, id);

    const { accessToken } = await getValidSpotifyAccessToken(id);
    const playback = await fetchPlaybackState(accessToken);

    if (!playback?.item) {
      return c.json({ playing: false, track: null });
    }

    const art =
      playback.item.album.images.sort(
        (a, b) => (b.width ?? 0) - (a.width ?? 0),
      )[0]?.url ?? null;

    return c.json({
      playing: playback.is_playing,
      track: {
        title: playback.item.name,
        artist: playback.item.artists.map((a) => a.name).join(", "),
        albumArtUrl: art,
        progressMs: playback.progress_ms ?? 0,
        durationMs: playback.item.duration_ms,
        isPlaying: playback.is_playing,
      },
    });
  },
);

deviceIntegrationRoutes.post(
  "/:id/integrations/spotify/transfer",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    if (auth.typ !== "device") {
      throw new HTTPException(403, {
        message: "Device authentication required to transfer Spotify playback",
      });
    }
    await requireDeviceAccess(auth, id);

    const body = await c.req.json<{
      spotifyDeviceId?: string;
      play?: boolean;
    }>();
    const spotifyDeviceId = body.spotifyDeviceId?.trim();
    if (!spotifyDeviceId) {
      throw new HTTPException(400, { message: "spotifyDeviceId is required" });
    }

    const { accessToken } = await getValidSpotifyAccessToken(id);
    await transferPlayback(accessToken, spotifyDeviceId, body.play !== false);
    return c.json({ ok: true });
  },
);

deviceIntegrationRoutes.post(
  "/:id/integrations/spotify/control",
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    await requireDeviceAccess(auth, id);

    const body = await c.req.json<{
      action?: SpotifyControlAction;
      currentlyPlaying?: boolean;
    }>();
    const action = body.action;
    if (
      action !== "play" &&
      action !== "pause" &&
      action !== "next" &&
      action !== "previous" &&
      action !== "toggle"
    ) {
      throw new HTTPException(400, {
        message: "action must be play|pause|next|previous|toggle",
      });
    }

    const { accessToken } = await getValidSpotifyAccessToken(id);
    await controlPlayback(accessToken, action, body.currentlyPlaying);
    return c.json({ ok: true });
  },
);

/**
 * Optional HTTPS server callback (e.g. Cloudflare tunnel).
 * Primary mobile flow uses porkauto:// + /complete instead.
 */
export const spotifyCallbackRoutes = new Hono();

spotifyCallbackRoutes.get("/spotify/callback", async (c) => {
  const error = c.req.query("error");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const androidRedirect = getSpotifyAndroidRedirect();

  const fail = (reason: string) => {
    const url = new URL(androidRedirect);
    url.searchParams.set("ok", "0");
    url.searchParams.set("error", reason);
    return c.redirect(url.toString(), 302);
  };

  if (error) return fail(error);
  if (!code || !state) return fail("missing_code_or_state");

  prunePending();
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  if (!pending) return fail("invalid_or_expired_state");

  try {
    const tokens = await exchangeAuthorizationCode(code);
    await persistSpotifyTokens(pending.deviceId, tokens);

    const url = new URL(androidRedirect);
    url.searchParams.set("ok", "1");
    url.searchParams.set("provider", "spotify");
    return c.redirect(url.toString(), 302);
  } catch (err) {
    console.error("Spotify OAuth callback failed:", err);
    return fail("token_exchange_failed");
  }
});
