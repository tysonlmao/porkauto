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

First launch registers a device with `POST /devices/register` and shows a pairing code (QR placeholder for the future companion app). Use **Skip setup (dev)** to enter the HUD without the API.

## API (auth required except health + device register)

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | — | Liveness |
| POST | `/auth/register` | — | `{ email, password }` |
| POST | `/auth/login` | — | `{ email, password }` → JWT |
| POST | `/devices/register` | — | Creates device + pairing code + device JWT |
| POST | `/devices/claim` | user JWT | `{ pairingCode }` binds device to user |
| GET | `/devices/:id/config` | user or device JWT | Read config |
| PATCH | `/devices/:id/config` | user or device JWT | `{ config }` merge |

Bearer token: `Authorization: Bearer <jwt>`

## Project layout

```
src/app/           React renderer
src/bun/           Electrobun main process
src/components/    HUD, map, setup UI
src/store/         Vehicle / indev state (Zustand)
server/            Public API
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
- Spotify / YouTube Music SDKs  
- Companion mobile app UI  
- Full turn-by-turn navigation beyond mock route + themed map  
