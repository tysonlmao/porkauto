# Plan 004: Fail closed when JWT_SECRET is missing or insecure

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- server/src/lib/auth.ts server/src/index.ts .env.example README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

`getSecret()` silently falls back to a well-known default string when
`JWT_SECRET` is unset. Any deployment that forgets the env var accepts JWTs
signed with that default — user, device, and owner tokens are forgeable.
Production (and preferably all environments) must refuse to sign/verify with
the insecure default.

**Never print or commit real secret values.** Reference env var names only.

## Current state

- `server/src/lib/auth.ts:5-7`:
  ```ts
  function getSecret() {
    const secret = process.env.JWT_SECRET ?? "dev-change-me-to-a-long-random-string";
    return encoder.encode(secret);
  }
  ```
- `.env.example:9` documents `JWT_SECRET=dev-change-me-to-a-long-random-string`
  (placeholder for local copy — keep a **placeholder** in the example file, but
  runtime must not treat “unset” as OK in production).
- API entry: `server/src/index.ts` — no boot-time env validation today.
- Local convention: Bun loads `.env` automatically when running the API.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Boot OK   | `JWT_SECRET='local-test-secret-at-least-32-chars!!' bun run server/src/index.ts` (or existing `dev:api`) | listens without throw |
| Boot fail | `env -u JWT_SECRET NODE_ENV=production bun run server/src/index.ts` | non-zero exit or thrown error before listen |

## Scope

**In scope**:
- `server/src/lib/auth.ts`
- `server/src/index.ts` (optional boot check that calls the validator early)
- `.env.example` — comment clarifying production requirements (no real secrets)
- `README.md` — one line under env/setup if needed
- `plans/README.md` (status)

**Out of scope**:
- Rotating secrets in any developer’s real `.env` (tell the operator to rotate if a default was ever used in a shared deploy — do not open or quote `.env`).
- Changing JWT TTLs or moving tokens out of localStorage.

## Git workflow

- Branch: `advisor/004-jwt-secret-fail-closed`
- Commit example: `Require JWT_SECRET and reject the insecure default.`
- Do NOT push unless instructed.

## Steps

### Step 1: Replace fail-open `getSecret`

Define a single constant for the insecure placeholder (same string as today’s
fallback / `.env.example` value) used **only for comparison**, not as a
signing default:

```ts
const INSECURE_JWT_SECRET_PLACEHOLDER =
  "dev-change-me-to-a-long-random-string";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (!secret) {
    throw new Error(
      "JWT_SECRET is required. Set it in the environment (see .env.example).",
    );
  }

  if (secret === INSECURE_JWT_SECRET_PLACEHOLDER && nodeEnv === "production") {
    throw new Error(
      "JWT_SECRET must not use the insecure .env.example placeholder in production.",
    );
  }

  // Development: allow the placeholder so `cp .env.example .env` keeps working,
  // but warn once.
  if (secret === INSECURE_JWT_SECRET_PLACEHOLDER) {
    console.warn(
      "[auth] JWT_SECRET is the insecure placeholder; set a unique value before any shared/deployed use.",
    );
  }

  return secret;
}

function getSecret() {
  return encoder.encode(resolveJwtSecret());
}
```

**Policy locked by this plan** (do not invent alternatives):

- **Unset `JWT_SECRET`**: always throw (all environments).
- **Placeholder value + `NODE_ENV=production`**: throw.
- **Placeholder value + non-production**: allow with `console.warn`.

Update `.env.example` with a one-line comment: production must set a unique
secret; unset is rejected at runtime.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Fail fast at API boot

In `server/src/index.ts`, before `export default` / listen, call
`resolveJwtSecret()` (export it from `auth.ts`) so a missing secret crashes
boot instead of the first authenticated request.

**Verify**:

```bash
# Should fail fast (missing secret)
env -u JWT_SECRET NODE_ENV=production bun -e 'import "./server/src/lib/auth.ts"'
# Or boot the server the same way the repo does and confirm it exits non-zero
```

With a non-placeholder secret set, `bun run dev:api` (or equivalent) still starts.

### Step 3: Docs touch

README or `.env.example`: note that `JWT_SECRET` is required and production
forbids the example placeholder. Do not paste any real secret.

**Verify**: `bun run typecheck` → exit 0.

## Test plan

- If plan 001’s runner exists, add `server/src/lib/auth.secret.test.ts` that:
  - sets/unsets `process.env.JWT_SECRET` / `NODE_ENV` in-process and asserts
    `resolveJwtSecret` throws or returns as specified.
  - Restore env in `afterEach`.
- If importing auth pulls DB/spotify — keep the test to the pure resolver only
  (export `resolveJwtSecret`).

## Done criteria

- [ ] No `?? "dev-change-me-…"` signing fallback remains in `getSecret`
- [ ] Unset `JWT_SECRET` throws
- [ ] Production + placeholder throws
- [ ] Dev + placeholder warns but works (matches `.env.example` workflow)
- [ ] `bun run typecheck` exits 0
- [ ] `plans/README.md` 004 → DONE

## STOP conditions

- Bun does not populate `NODE_ENV` the way you expect in this repo — still enforce
  unset-secret throw; for placeholder, treat `NODE_ENV === "production"` strictly
  as specified; do not invent extra “isDeployed” heuristics.
- You find JWT signing in another file with its own secret fallback — fix those
  call sites to use `getSecret`/`resolveJwtSecret` only; if a third-party path
  exists outside server/, STOP and report.

## Maintenance notes

- If this secret was ever used outside a single-developer machine, rotate
  `JWT_SECRET` and expect all outstanding JWTs to invalidate (API keys still work).
- Reviewers: confirm `.env` is still gitignored and no secret values appear in the diff.
