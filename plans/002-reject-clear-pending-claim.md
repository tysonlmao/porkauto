# Plan 002: Clear pending claim on reject instead of deleting the device

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- server/src/routes/devices.ts src/components/setup/SetupScreen.tsx src/lib/api.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pairs well with 003; if both are done together, implement 003’s auth rules in the same DELETE handler)
- **Category**: bug
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

When the host taps reject on a pending companion link, the UI calls
`unpairDevice` → `DELETE /devices/:id/claim`, which **deletes the entire device
row**. The setup screen then returns to `"waiting"` with the **old** pairing
code still shown. Polls against the deleted device 404 and the display cannot
complete pairing without a full re-register. Reject must clear the pending
claim and keep the host device + pairing code.

## Current state

- `server/src/routes/devices.ts:253-277` — DELETE always destroys the device:
  ```ts
  deviceRoutes.delete("/:id/claim", requireAuth, async (c) => {
    // ...
    // Purge device (+ cascaded integrations) on unpair.
    await db.delete(devices).where(eq(devices.id, device.id));
    return c.json({
      deleted: true,
      deviceId: id,
      paired: false,
      confirmed: false,
      pairingStatus: "unpaired" as const,
    });
  });
  ```
- `src/components/setup/SetupScreen.tsx:228-242` — reject calls unpair then waits:
  ```ts
  async function handleRejectLink() {
    // ...
    try {
      await unpairDevice(device.deviceId, credential);
    } catch {
      // Still return to waiting UI.
    }
    linkedAnnounced.current = false;
    setDevice((prev) => (prev ? { ...prev, paired: false } : prev));
    setPhase("waiting");
  }
  ```
- `src/lib/api.ts:214-234` — client DELETE; treats 404 as success.
- Pairing helpers live in `server/src/middleware/auth.ts`: `pairingStatus`,
  `isDeviceConfirmed`, `isDeviceClaimed` — reuse these; do not reimplement.
- Error style: `HTTPException` with `{ message }` → JSON `{ error }` via
  `server/src/index.ts` `onError`. Match existing routes.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Tests     | `bun test` (after 001) or skip if 001 not landed | exit 0 |

## Scope

**In scope**:
- `server/src/routes/devices.ts` — `DELETE /:id/claim` behavior for **pending** claims
- `src/lib/api.ts` — only if response shape changes require client typing (prefer keeping response backward-compatible)
- `src/components/setup/SetupScreen.tsx` — only if needed to keep waiting UI consistent after clear
- `plans/README.md` (status row)

**Out of scope**:
- Confirmed-pair full teardown semantics beyond “still delete device when confirmed” (keep current delete-on-confirmed-unpair unless 003 changes auth who may delete).
- Rate limiting / longer pairing codes (finding #6).
- Characterization test suite (plan 006) — optional tiny test here only if 001’s runner exists and you can add a focused server test without new infra; otherwise defer to 006.

## Git workflow

- Branch: `advisor/002-reject-clear-claim` (or combine with 003 on `advisor/002-003-pairing-unpair`)
- Commit message example: `Clear pending claim on reject instead of deleting device.`
- Do NOT push unless instructed.

## Steps

### Step 1: Change pending DELETE to clear claim fields

In `deviceRoutes.delete("/:id/claim", ...)` after `canAccessDevice` succeeds:

1. Compute status with `pairingStatus(device)`.
2. **If status is `"pending"`** (claimed, not confirmed):
   - `UPDATE devices SET ownerTokenHash=null, companionName=null, claimedAt=null, confirmedAt=null` (and any other owner-claim columns present on the row — read `server/src/db/schema.ts` and clear all claim/owner fields).
   - Do **not** `db.delete`.
   - Return JSON compatible with the client, e.g.:
     ```ts
     return c.json({
       deleted: false,
       cleared: true,
       deviceId: id,
       paired: false,
       confirmed: false,
       pairingStatus: "unpaired" as const,
     });
     ```
3. **If status is `"confirmed"`**: keep existing `db.delete(devices)` behavior and `{ deleted: true, ... }` response (subject to plan 003 auth tightening if applied in the same change).
4. **If status is `"unpaired"`**: return 404 or success-no-op consistent with “already unpaired” — prefer 404 so existing client `unpairDevice` 404 handling still works, or 200 with `cleared: false`. Pick one and document in the PR/commit body.

**Verify**: With API + Postgres running (`bun run db:up`, `bun run db:migrate`, `bun run dev:api`):

```bash
# Register
curl -s -X POST http://localhost:3001/devices/register -H 'Content-Type: application/json' -d '{}'
# Claim with returned pairingCode
curl -s -X POST http://localhost:3001/devices/claim -H 'Content-Type: application/json' \
  -d '{"pairingCode":"<CODE>","name":"TestPhone"}'
# Reject/clear as HOST using device apiKey from register
curl -s -X DELETE http://localhost:3001/devices/<DEVICE_ID>/claim \
  -H "Authorization: Bearer <DEVICE_API_KEY>"
```

Expected: response has `pairingStatus":"unpaired"` and `deleted":false` (or equivalent);  
`GET` config with same device key still works (device row exists); pairing code still usable for a new claim.

### Step 2: Ensure setup reject UX stays on the same device

Confirm `handleRejectLink` still lands on `"waiting"` with the same `device.deviceId` / `pairingCode`. If `unpairDevice` throws because it requires `deleted: true`, update `unpairDevice` to accept `{ deleted: true | false }` / 200 with cleared claim as success (do not treat as error).

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Manual UI check (if display available)

Register → claim from a second client → host reject → waiting screen still shows same code → second claim succeeds.

**Verify**: typecheck still green; no new runtime errors in API logs.

## Test plan

- Prefer deferring automated coverage to plan 006.
- If 001 is already done and you add a test here: one integration-style test
  `register → claim → DELETE as device → register row still exists / status unpaired`
  using Hono `app.request` against the exported app from `server/src/index.ts`
  (may need exporting `app` — only do this if straightforward; otherwise STOP and leave to 006).

## Done criteria

- [ ] Pending `DELETE /devices/:id/claim` does not remove the device row
- [ ] Response indicates unpaired / cleared; host credentials still authenticate
- [ ] `SetupScreen` reject returns to waiting with the same pairing session
- [ ] Confirmed unpair still removes the device (unless 003 explicitly changed that and documented it)
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` status row for 002 → DONE

## STOP conditions

- Schema columns for claim fields differ from what this plan names — read `schema.ts` and clear the actual claim columns; if there is no clean “clear claim” set of columns, STOP and report.
- Companion app (out of repo) hard-requires `deleted: true` on every DELETE — preserve `deleted: true` only for confirmed deletes; for pending clear, `deleted: false` is correct. If you find in-repo client code that breaks, fix in-scope clients only.
- Plan 003 not yet applied and you believe pending-owner delete-DoS must be fixed first — you may implement 003’s rules in the same PR (preferred).

## Maintenance notes

- Reviewers: confirm reject does not rotate pairing code unexpectedly (keeping the code is intentional for UX).
- Follow-up: plan 003 (who may delete), plan 006 (characterization tests for this matrix).
