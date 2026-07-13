# Plan 007: Remove dead Google Maps path and fix README

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- src/components/map/ package.json README.md .env.example src/vite-env.d.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

The live map is MapLibre (`MapBackground.tsx` → `MapLibreBackground`).
`RoutePolyline.tsx` still imports `@vis.gl/react-google-maps` and is **unused**.
README and `.env.example` still tell contributors to configure Google Maps.
That wastes install surface and mis-trains humans and agents.

## Current state

- `src/components/map/MapBackground.tsx:11-14`:
  ```ts
  /**
   * Navigation map (MapLibre dark basemap).
   * Google Maps remains available later for branded cloud styles once the key is stable.
   */
  ```
- `src/components/map/RoutePolyline.tsx` — only consumer of `@vis.gl/react-google-maps`;
  grep shows no imports of `RoutePolyline` elsewhere under `src/`.
- `package.json` dependencies include `"@vis.gl/react-google-maps": "^1.5.3"`.
- `package.json` devDependencies include `"@types/google.maps": "^3.58.1"`.
- `README.md:3,9,19` still describe Google Maps / `VITE_GOOGLE_MAPS_API_KEY`.
- `README.md:34-41` describes an old “indev” mock-state cycle; live
  `IndevButton` / `devTools.ts` use `VITE_DEV_TOOLS` + PRND swipe — **update the
  indev section to match code** while you are in the README (same plan, docs-only).
- `README.md:126` says full turn-by-turn is out of scope while OSRM + maneuver
  UI exist — rewrite that bullet to: “Production-grade nav (offline, voice, lane
  guidance)” or similar; do **not** claim OSRM HUD routing does not exist.
- `.env.example:1-2` has `VITE_GOOGLE_MAPS_API_KEY=`.
- `src/vite-env.d.ts` declares `VITE_GOOGLE_MAPS_API_KEY?: string`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Install   | `bun install` | exit 0 after removing deps |
| Typecheck | `bun run typecheck` | exit 0 |
| Grep dead | `rg -n 'react-google-maps|RoutePolyline|VITE_GOOGLE_MAPS' --glob '!plans/**' --glob '!bun.lock'` | no matches in src/package/README/.env.example (lockfile will update) |

## Scope

**In scope**:
- Delete `src/components/map/RoutePolyline.tsx`
- `package.json` — remove `@vis.gl/react-google-maps` and `@types/google.maps` if unused
- `bun.lock` — via `bun install`
- `README.md` — stack, maps, env, indev controls, out-of-scope nav bullet; add `/geo` rows briefly if missing (align with API table)
- `.env.example` — remove Google key line
- `src/vite-env.d.ts` — remove Google key type
- `plans/README.md` (status)

**Out of scope**:
- Rewriting MapLibre styles or navigation camera
- Re-adding Google Maps “for later” behind a feature flag
- Pinning `electrobun`/`vite` versions (separate finding)
- Implementing companion app / PRODUCT.md (direction only)

## Git workflow

- Branch: `advisor/007-maplibre-readme-cleanup`
- Commit example: `Remove unused Google Maps path and update README for MapLibre.`
- Do NOT push unless instructed.

## Steps

### Step 1: Confirm RoutePolyline is unused

```bash
rg -n 'RoutePolyline' src/
```

Expected: only `RoutePolyline.tsx` itself. If another file imports it, STOP.

### Step 2: Delete dead code and dependencies

1. Delete `src/components/map/RoutePolyline.tsx`
2. Remove `@vis.gl/react-google-maps` from `dependencies`
3. Remove `@types/google.maps` from `devDependencies` if nothing else needs it
4. Run `bun install` to refresh the lockfile

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Fix env typings and example

- Remove `VITE_GOOGLE_MAPS_API_KEY` from `.env.example` and `src/vite-env.d.ts`.
- Keep MapLibre/OSRM-related docs accurate; do not invent new required env vars.

**Verify**: `rg -n 'VITE_GOOGLE_MAPS' .env.example src/vite-env.d.ts` → no matches.

### Step 4: Rewrite README sections

Update at minimum:

1. Tagline / Stack — MapLibre (`maplibre-gl`), not Google Maps JS API.
2. Quick start — remove optional Google key instruction.
3. Indev controls — document actual behavior: bottom-right indev shows pairing /
   reset; with `VITE_DEV_TOOLS=true`, PRND swipe changes gear (`src/lib/devTools.ts`,
   `PrndlIndicator.tsx`). Read those files and describe accurately in ≤6 lines.
4. Out of scope — replace “full turn-by-turn beyond mock route” with a boundary
   that acknowledges OSRM + maneuver banner exist (e.g. no offline tiles / no TTS /
   no lane guidance).
5. API table — add brief rows for `GET /geo/approx` (public), `GET /geo/search`,
   `GET /geo/speed-limit`, `GET /geo/route` (note auth if plan 005 already merged;
   if not, say “currently unauthenticated — auth pending” **or** just list paths
   and methods without lying about auth). Prefer reading live `geo.ts` + whether
   005 landed.
6. Scripts — add `dev:tunnel` if still missing.

**Verify**: README no longer claims Google Maps is the active basemap.

## Test plan

- No new automated tests required.
- `bun run typecheck` is the gate.
- Optional: `bun run check` if 001 landed.

## Done criteria

- [ ] `RoutePolyline.tsx` deleted
- [ ] `@vis.gl/react-google-maps` removed from package.json / lockfile
- [ ] No `VITE_GOOGLE_MAPS_API_KEY` in example env or vite-env types
- [ ] README describes MapLibre + accurate indev + honest nav scope
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` 007 → DONE

## STOP conditions

- Something still imports `RoutePolyline` or `@vis.gl/react-google-maps` outside
  the deleted file — report callers; do not delete until resolved.
- MapLibre is not actually used at runtime (drift) — STOP; do not remove Google
  until the live path is clear.

## Maintenance notes

- Comment in `MapBackground` may still mention Google-for-later — shorten to
  “MapLibre basemap” or keep one speculative sentence; either is fine.
- Reviewers: ensure README API auth notes match post-005 reality if both merge.
- Follow-up: AGENTS.md / PRODUCT.md (direction finding; not this plan).
