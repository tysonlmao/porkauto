# Plan 003: Stop pending owners from deleting the host device

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- server/src/routes/devices.ts server/src/middleware/auth.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: ideally land with or after `plans/002-reject-clear-pending-claim.md` (same handler)
- **Category**: security
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

`POST /devices/claim` is public and immediately returns an owner `apiKey` + JWT
while status is still `"pending"` (host has not confirmed). That same pending
owner can call `DELETE /devices/:id/claim`, which currently **deletes the host
device row** (and cascaded Spotify integrations). A claim race or guessed
pairing code becomes a denial-of-service against the display. Pending principals
may clear their own claim; only the host device (or a **confirmed** owner) may
destroy the device record.

## Current state

- Claim grants credentials before confirm — `server/src/routes/devices.ts:83-137`.
- DELETE allows any `canAccessDevice` principal, then deletes — `:253-269`:
  ```ts
  if (!canAccessDevice(auth, device)) {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }
  await db.delete(devices).where(eq(devices.id, device.id));
  ```
- `canAccessDevice` (`server/src/middleware/auth.ts:111-122`) returns true for
  `typ: "device" | "owner" | "user"` matched to the device — it does **not**
  distinguish pending vs confirmed.
- `pairingStatus(device)` returns `"unpaired" | "pending" | "confirmed"`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope**:
- `server/src/routes/devices.ts` — authorization + behavior of `DELETE /:id/claim`
- Optionally a tiny helper in `server/src/middleware/auth.ts` if it keeps the route readable
- `plans/README.md` (status)

**Out of scope**:
- Changing claim to withhold `apiKey` until confirm (larger product change).
- Pairing code entropy / rate limits (finding #6).
- Client SetupScreen changes except if DELETE response codes change in a breaking way (coordinate with 002).

## Git workflow

- Branch: `advisor/003-pending-delete-auth` or shared branch with 002
- Commit example: `Restrict device deletion to host or confirmed owner.`
- Do NOT push unless instructed.

## Steps

### Step 1: Encode the authorization matrix in DELETE

After loading the device and `canAccessDevice` check, apply:

| pairingStatus | auth.typ | Allowed action |
|---------------|----------|----------------|
| `pending` | `device` | Clear claim fields (plan 002) — do not delete row |
| `pending` | `owner` | Clear claim fields only (abandon claim) — do **not** delete row |
| `pending` | `user` | 403 (or clear if you can prove user is host — prefer 403; user pairing is legacy) |
| `confirmed` | `device` | Delete device row (current unpair) |
| `confirmed` | `owner` | Delete device row (current unpair) |
| `confirmed` | `user` | Delete only if `canAccessDevice` already true via `pairedUserId` |
| `unpaired` | any | 404 |

Implementation sketch:

```ts
const status = pairingStatus(device);

if (status === "pending") {
  // clear claim columns… (plan 002)
  return c.json({ deleted: false, cleared: true, /* … */ });
}

if (status === "confirmed") {
  if (auth.typ !== "device" && auth.typ !== "owner" && auth.typ !== "user") {
    throw new HTTPException(403, { message: "Not authorized for this device" });
  }
  // existing canAccessDevice already enforced
  await db.delete(devices).where(eq(devices.id, device.id));
  return c.json({ deleted: true, /* … */ });
}

throw new HTTPException(404, { message: "Device not found" });
```

Critical invariant: **never** `db.delete` when `status === "pending"`.

**Verify** (API up):

1. register → claim → `DELETE` with **owner** apiKey → device still exists; owner key no longer works; device apiKey still works; status unpaired.
2. register → claim → confirm (host) → `DELETE` with owner or device key → device gone (404 on subsequent GET config).

### Step 2: Typecheck

**Verify**: `bun run typecheck` → exit 0.

## Test plan

- Automated matrix belongs in plan 006. Manual curl matrix above is required here.
- Cases that must be proven manually before DONE:
  - Pending owner cannot wipe device
  - Pending device (host) clears claim without wipe
  - Confirmed either side can still unpair via delete

## Done criteria

- [ ] No code path deletes a device row while `pairingStatus === "pending"`
- [ ] Pending owner DELETE clears claim only
- [ ] Confirmed unpair still deletes (or explicitly documented alternative)
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` 003 → DONE

## STOP conditions

- Confirm endpoint semantics differ (e.g. claim already sets `confirmedAt`) — re-read `POST /:id/confirm` and adjust matrix; do not invent new pairing states.
- You cannot clear claim without deleting because of NOT NULL constraints — STOP and report schema issue.

## Maintenance notes

- Reviewers: focus on the pending-owner path; that is the vulnerability.
- Follow-up: rate-limit claim (finding #6); characterization tests (006).
