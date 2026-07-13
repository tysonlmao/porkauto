# Plan 006: Characterization tests for device pairing and auth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- server/src/routes/devices.ts server/src/middleware/auth.ts server/src/index.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/001-verification-baseline.md` (test runner); strongly prefer `002` + `003` already merged so tests lock the fixed unpair matrix
- **Category**: tests
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

Pairing is the product’s core trust boundary (register → claim → confirm →
config → unpair). There are zero automated tests. Refactors to auth or devices
routes can brick the HUD ↔ companion flow with no signal. This plan adds
characterization tests that document the intended matrix after plans 002/003.

## Current state

- No `*.test.ts` in server/ at plan time (001 adds Bun test + app smoke test).
- App export: `server/src/index.ts` exports `{ port, hostname, fetch }` for Bun
  serve — the `Hono` `app` is **not** currently exported. You will need
  `export { app }` or `export default app` alongside the Bun serve export so
  tests can call `app.request(...)`.
- DB: Drizzle + Postgres via `DATABASE_URL` (`server/src/db/client.ts`). Tests
  need a real Postgres (Docker `bun run db:up`) unless you introduce a test
  DB URL. **Do not** add SQLite or mock the entire DB layer in this plan.
- Auth helpers to cover as pure unit tests (no DB): `pairingStatus`,
  `isDeviceClaimed`, `isDeviceConfirmed`, `canAccessDevice` in
  `server/src/middleware/auth.ts`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| DB up     | `bun run db:up` && `bun run db:migrate` | Postgres healthy; migrate exits 0 |
| Tests     | `bun test server` or `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Check     | `bun run check` | exit 0 |

## Scope

**In scope**:
- `server/src/index.ts` — export `app` for `app.request`
- `server/src/middleware/auth.pairing.test.ts` (or similar) — pure helper tests
- `server/src/routes/devices.pairing.test.ts` — HTTP characterization via `app.request`
- `plans/README.md` (status)
- Minimal test helpers under `server/src/test/` **only if needed** (e.g. `withTestDevice.ts`)

**Out of scope**:
- Spotify/OAuth tests
- Geo auth tests (optional one 401 case is fine if 005 landed; not required)
- Frontend component tests
- CI workflow files (mention as follow-up only)

## Git workflow

- Branch: `advisor/006-pairing-characterization-tests`
- Commit example: `Add pairing and auth characterization tests.`
- Do NOT push unless instructed.

## Steps

### Step 1: Export the Hono app

In `server/src/index.ts`, keep Bun’s default export for serving, and also:

```ts
export { app };
// or export app as named + default serve object unchanged
```

Ensure `bun run dev:api` still works.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Pure auth helper tests

Create `server/src/middleware/auth.pairing.test.ts` using `bun:test`.

Cover at least:

1. `pairingStatus` unpaired / pending / confirmed transitions for fixture objects
2. `canAccessDevice` true/false for device, owner, wrong id, user mismatch

No DB. No network.

**Verify**: `bun test server/src/middleware/auth.pairing.test.ts` → pass.

### Step 3: HTTP pairing characterization

Create `server/src/routes/devices.pairing.test.ts`.

Pattern:

```ts
import { describe, expect, test, beforeAll } from "bun:test";
import { app } from "../index";

async function register() {
  const res = await app.request("/devices/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Display" }),
  });
  expect(res.status).toBe(200);
  return res.json();
}
```

**Required cases** (adjust expectations to match 002/003 if already merged):

1. `POST /devices/register` → 200 with `pairingCode`, `apiKey`/`deviceSecret`, `token`, `device.id`
2. `POST /devices/claim` with bad code → 404
3. `POST /devices/claim` with good code → 200, `pairingStatus: "pending"`, owner `apiKey`
4. Second claim same code → 409
5. `POST /devices/:id/confirm` with **device** bearer → confirmed
6. `GET /devices/:id/config` with device key → 200; without auth → 401
7. **Unpair matrix (post-002/003)**:
   - pending + owner DELETE → device still exists (`GET` with device key 200), owner key 401
   - pending + device DELETE → claim cleared, device exists
   - confirmed + device DELETE → subsequent GET config 404

If 002/003 are **not** merged yet: write tests that match **current** buggy behavior only for register/claim/confirm/config, and add a `test.todo` or commented block for the unpair matrix with a note “enable after 002/003”. Prefer waiting — **STOP and report** if you would otherwise lock in the buggy delete-on-pending behavior as desired.

Use a unique device per test to avoid cross-talk. Clean up by deleting confirmed devices when possible.

**Verify**: `bun test server/src/routes/devices.pairing.test.ts` → pass (with DB up).

### Step 4: Document test prerequisites

Add 3–5 lines to `plans/README.md` or a short comment at top of the HTTP test file:

```
Requires: bun run db:up && bun run db:migrate
Uses DATABASE_URL from env / .env
```

Do not commit secrets.

**Verify**: `bun run check` → exit 0.

## Test plan

- This plan **is** the test plan. Minimum counts:
  - ≥4 pure helper assertions/tests
  - ≥6 HTTP tests covering register/claim/confirm/config/unpair
- Pattern: `bun:test` + `app.request` (Hono).

## Done criteria

- [ ] `app` is importable for tests without breaking API serve
- [ ] `bun test` passes with DB available
- [ ] Unpair tests match post-002/003 behavior (or explicitly skipped with todo + reason)
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` 006 → DONE

## STOP conditions

- Postgres cannot be started in the executor environment — STOP; do not switch to mocks that diverge from Drizzle schema.
- Exporting `app` causes double-listen or import side effects that break tests — refactor index to `createApp()` in `server/src/app.ts` **only if required**; keep the change minimal. If that balloons past ~40 lines of move, STOP and report.
- 002/003 not done and product owner wants tests against old delete behavior — do not encode the vulnerability as correct; skip those cases.

## Maintenance notes

- Any change to pairingStatus transitions must update these tests first.
- Reviewers: ensure tests do not log apiKeys/tokens at info level.
- Follow-up: CI job with Postgres service container.
