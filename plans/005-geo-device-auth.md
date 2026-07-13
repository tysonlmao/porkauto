# Plan 005: Require device auth on geo proxy routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- server/src/routes/geo.ts server/src/middleware/auth.ts server/src/index.ts src/lib/routing.ts src/lib/speedLimit.ts src/lib/geolocation.ts src/store/vehicle.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (works better after 001 so typecheck/tests are green)
- **Category**: security
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

`/geo` is mounted with **no authentication** and proxies caller-controlled
queries to Nominatim, Overpass, and OSRM (`server/src/index.ts:34`,
`server/src/routes/geo.ts`). An internet-exposed API becomes an open proxy that
can burn upstream quotas or get the server IP blocked. HUD clients already have
device JWT/apiKey after setup — geo must require them.

## Current state

- Geo routes (all unauthenticated): `/approx`, `/search`, `/speed-limit`, `/route`
  in `server/src/routes/geo.ts` (`export const geoRoutes = new Hono()` at ~113).
- Existing auth middleware `requireAuth` (`server/src/middleware/auth.ts:22-72`)
  accepts JWT **or** raw API key, but API-key mode requires path param `:id`
  (`c.req.param("id")`). Geo routes have no `:id`.
- Clients call geo **without** Authorization today:
  - `src/lib/routing.ts:78-79` — `fetch(url)` for search
  - `src/lib/routing.ts:103-105` — `fetch(url)` for route
  - `src/lib/speedLimit.ts:24-25` — `fetch(url)` for speed limit
  - `src/lib/geolocation.ts:193` — `fetchJson('/geo/approx')` (also has public IP fallbacks)
- Device credentials after setup live in Zustand / localStorage key
  `porkauto.device` (`deviceApiKey`, `deviceToken`, `deviceId`) via
  `src/store/vehicle.ts`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Unauth geo | `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3001/geo/search?q=test'` | `401` |
| Auth geo | `curl -s -H "Authorization: Bearer <deviceApiKey>" -H "X-Device-Id: <deviceId>" 'http://localhost:3001/geo/search?q=brisbane'` | `200` JSON with `results` (or empty list), not 401 |

## Scope

**In scope**:
- `server/src/middleware/auth.ts` — add middleware that authenticates geo callers without requiring `/devices/:id` in the path
- `server/src/routes/geo.ts` — attach middleware to routes that proxy upstream
- `src/lib/routing.ts`, `src/lib/speedLimit.ts`, `src/lib/geolocation.ts` — send credentials
- Small shared helper if needed, e.g. `src/lib/deviceAuthHeaders.ts` (create) used by the three clients
- `src/store/vehicle.ts` — only if you must export a getter for credentials (prefer reading `useVehicleStore.getState()` from the helper)
- `README.md` — note that `/geo/*` requires device auth (except any route you intentionally leave public)
- `plans/README.md` (status)

**Out of scope**:
- Rate limiting implementation beyond auth (nice follow-up; do not build Redis).
- Moving geo under `/devices/:id/geo` (would work but churns more URLs; this plan standardizes on header + bearer).
- Skip-setup HUD without credentials — geo may fail; IP approx fallbacks outside `/geo` remain OK.

## Locked design (do not bikeshed)

1. Add `requireDeviceBearer` (name flexible) middleware:
   - Parse `Authorization: Bearer <token>` (401 if missing).
   - Try `verifyToken`; accept payloads with `typ === "device" || typ === "owner"` (reject pure `user` for geo unless you also verify device access — simplest: **device and owner only**).
   - Else treat token as API key: require header `X-Device-Id: <uuid>`, load device, `verifySecret` against `deviceSecretHash` or `ownerTokenHash`, set `auth` accordingly.
2. Apply this middleware to **`/search`, `/speed-limit`, `/route`**.
3. **`/geo/approx`**: leave **public** (used before pairing; clients already fall back to geojs/ipwho). Document that choice in README.
4. Client helper reads `deviceId` + (`deviceApiKey` || `deviceToken`) from `useVehicleStore.getState()`; if missing, throw a clear error (callers already handle fetch failures). Attach:
   ```ts
   headers: {
     Authorization: `Bearer ${credential}`,
     "X-Device-Id": deviceId,
   }
   ```
   JWT-only callers still send `X-Device-Id` (harmless) **or** omit it when credential is a JWT — middleware must accept JWT without the header.

## Git workflow

- Branch: `advisor/005-geo-device-auth`
- Commit example: `Require device auth for geo search, route, and speed-limit.`
- Do NOT push unless instructed.

## Steps

### Step 1: Implement `requireDeviceBearer` in auth middleware

Export it next to `requireAuth`. Reuse `verifyToken`, `verifySecret`, `db.query.devices`.

**Verify**: `bun run typecheck` still compiles middleware (may fail until Step 2 wires types — OK if only unused export).

### Step 2: Protect geo routes

```ts
geoRoutes.use("/search", requireDeviceBearer);
geoRoutes.use("/speed-limit", requireDeviceBearer);
geoRoutes.use("/route", requireDeviceBearer);
// do NOT protect /approx
```

Hono path rules: confirm `use` pattern matches how this Hono version mounts (if `use("/search")` does not fire, wrap each handler or use `geoRoutes.get("/search", requireDeviceBearer, async …)`). Prefer per-route middleware args if `use` is unreliable.

**Verify**: unauthenticated `curl` to `/geo/search` → 401; `/geo/approx` → still 200/JSON without auth.

### Step 3: Client credential headers

Create `src/lib/deviceAuthHeaders.ts`:

```ts
import { useVehicleStore } from "@/store/vehicle";

export function deviceAuthHeaders(): HeadersInit {
  const { deviceId, deviceApiKey, deviceToken } = useVehicleStore.getState();
  const credential = deviceApiKey || deviceToken;
  if (!deviceId || !credential) {
    throw new Error("Device credentials required for map/geo requests");
  }
  return {
    Authorization: `Bearer ${credential}`,
    "X-Device-Id": deviceId,
  };
}
```

Update `routing.ts`, `speedLimit.ts` fetches to pass these headers. For `geolocation.ts` `/geo/approx`, **no** auth headers (public).

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Manual auth round-trip

With API + registered device credentials from `POST /devices/register`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3001/geo/route?fromLat=-27.5&fromLng=153.0&toLat=-27.6&toLng=153.1'
# expect 401

curl -s -H "Authorization: Bearer <apiKey>" -H "X-Device-Id: <id>" \
  'http://localhost:3001/geo/route?fromLat=-27.5&fromLng=153.0&toLat=-27.6&toLng=153.1'
# expect 200 or 404 from OSRM, never 401
```

**Verify**: README API section lists auth on geo search/route/speed-limit; approx public.

## Test plan

- After 001: optional `server` test that `app.request('/geo/search?q=ab')` → 401 and with forged missing auth stays 401.
- Full pairing+geo E2E deferred; manual curl is required for DONE.

## Done criteria

- [ ] Unauthenticated `/geo/search`, `/geo/route`, `/geo/speed-limit` return 401
- [ ] Authenticated device/owner requests succeed past auth
- [ ] `/geo/approx` remains usable without auth
- [ ] Client routing/speed-limit send Authorization (+ X-Device-Id for API keys)
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` 005 → DONE

## STOP conditions

- Hono middleware composition in this version cannot attach to geo routes without remounting under `/devices/:id` — STOP and report; do not silently leave routes open.
- Skip-setup / indev flows require unauthenticated route building as a product requirement — STOP and report rather than weakening auth; operator may then choose to keep approx-only public and document skip-setup limits.
- Circular import between `vehicle.ts` and geo helpers — extract credential read to localStorage `porkauto.device` JSON parse instead; do not restructure the whole store.

## Maintenance notes

- Reviewers: confirm JWT path works without `X-Device-Id`, API key path requires it.
- Follow-up: per-IP rate limits; optional auth on `/approx` once setup always precedes IP lookup.
