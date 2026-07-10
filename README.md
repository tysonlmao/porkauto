# porkauto

Standalone car display — a CarPlay / Android Auto alternative that runs without a tethered phone. Rich HUD statuses (nav, music, time, PRNDL) over a themed Google Map, with a public API for later mobile configuration.

## Stack

- **Display:** Electrobun + Vite + React + TypeScript + Tailwind
- **API:** Bun + Hono + Drizzle + Postgres (Docker)
- **Maps:** Google Maps JavaScript API (`@vis.gl/react-google-maps`)

## Quick start

```bash
# 1. Install
bun install

# 2. Env
cp .env.example .env
# Optional: set VITE_GOOGLE_MAPS_API_KEY for the live map

# 3. Database + migrate
bun run db:up
bun run db:migrate

# 4. Dev (Vite + Electrobun + API)
bun run dev
```

- Renderer: http://localhost:5173 (Electrobun — localhost is a secure context)
- iPad GPS: run `bun run dev:tunnel` and open the printed `https://*.trycloudflare.com` URL (Safari needs a real cert; self-signed LAN HTTPS is rejected)
- API: http://localhost:3001 (`GET /health`)  
- Electrobun window loads the Vite URL in dev

## Indev controls

Bottom-right **indev** button cycles mock vehicle states:

1. Connecting  
2. Park (clock + PRNDL P)  
3. Drive (map, music, nav, speed limit, 5G)  
4. Drive alt (ethernet, different route/music)

**reset setup** clears local pairing and returns to the setup screen.

## Setup / pairing

First launch registers a device with `POST /devices/register` (same-origin via Vite proxy so Cloudflare tunnel / iPad Safari works) and shows a pairing code + QR. The QR encodes `{ v, api, code, deviceId }` for the companion app. The display stores a host `apiKey`. The Android companion claims with the pairing code or QR scan (no account) and receives its own owner `apiKey`. Use **Skip setup (dev)** to enter the HUD without the API.

## API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | — | Liveness |
| POST | `/auth/register` | — | Optional account (legacy) |
| POST | `/auth/login` | — | Optional account → user JWT |
| POST | `/devices/register` | — | Creates device + pairing code + host `apiKey` + device JWT |
| POST | `/devices/claim` | — | `{ pairingCode }` → owner `apiKey` (pending until host confirms) |
| POST | `/devices/:id/confirm` | device JWT/API key | Host confirms pairing |
| POST | `/devices/:id/token` | — | `{ apiKey }` → fresh JWT (host or owner key) |
| DELETE | `/devices/:id/claim` | device/owner JWT or API key | Unpair; both sides return to unpaired |
| GET | `/devices/:id/config` | device/owner JWT or API key | `{ name, paired, confirmed, pairingStatus, config }` |
| PATCH | `/devices/:id/config` | device/owner JWT or API key | `{ config }` merge (owner requires confirmed) |
| GET | `/devices/:id/integrations` | device/owner | Connected services list (Spotify, …) |
| POST | `/devices/:id/integrations/spotify/start` | owner | `{ authorizeUrl }` — start OAuth |
| DELETE | `/devices/:id/integrations/spotify` | owner/device | Unlink Spotify |
| GET | `/devices/:id/integrations/spotify/token` | **device** | Fresh access token for Web Playback SDK |
| GET | `/devices/:id/integrations/spotify/player` | device/owner | Current playback (HUD fallback) |
| GET | `/integrations/spotify/callback` | — | OAuth redirect; stores tokens, deep-links to Android |

Bearer: `Authorization: Bearer <jwt|apiKey>` (raw API keys work on device-scoped routes).

Host and companion each get a UUID API key at register/claim; hashes are stored in Postgres (`device_secret_hash` / `owner_token_hash`).

## Spotify (connected service)

Playback runs on the **host** via Spotify Web Playback SDK (Connect device name: `Porkauto`). Link the account from the Android companion.

1. Create an app at https://developer.spotify.com/dashboard  
2. Add Redirect URI **exactly** (must match `.env`):

   `porkauto://oauth/spotify`

3. Copy Client ID / Secret into `.env`:

```bash
SPOTIFY_CLIENT_ID=…
SPOTIFY_CLIENT_SECRET=…
SPOTIFY_REDIRECT_URI=porkauto://oauth/spotify
SPOTIFY_ANDROID_REDIRECT=porkauto://oauth/spotify
```

4. `bun run db:migrate` · **restart the API** so it reloads `.env`  
5. Companion: **Configure → Connected services → Link Spotify**  
   Spotify redirects to `porkauto://…` → app finishes with `/complete`  
6. On the display, transfer playback to **Porkauto**.

Requires **Spotify Premium**.

If the Dashboard rejects the custom scheme, use an HTTPS Cloudflare tunnel to the API instead and set that same HTTPS callback URL in both Dashboard and `SPOTIFY_REDIRECT_URI`.## Project layout

```
src/app/           React renderer
src/bun/           Electrobun main process
src/components/    HUD, map, setup UI
src/store/         Vehicle / indev state (Zustand)
src/lib/spotifyPlayer.ts  Web Playback SDK host player
server/            Public API (+ integrations)
docker-compose.yml Postgres 16
```

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Start Postgres (if needed) + renderer + app + API |
| `bun run db:up` / `db:down` | Docker Postgres |
| `bun run db:migrate` | Apply SQL schema |
| `bun run build` | Vite + Electrobun production build |
| `bun run typecheck` | TypeScript (app + server) |

## Out of scope (for now)

- Real OBD-II / CAN PRNDL  
- YouTube Music / other music providers  
- Phone remote transport controls for Spotify  
- Full turn-by-turn navigation beyond mock route + themed map  
