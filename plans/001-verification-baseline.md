# Plan 001: Restore typecheck and add a minimal verification baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 181a5e8..HEAD -- package.json vite.config.ts tsconfig.json server/tsconfig.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `181a5e8`, 2026-07-13

## Why this matters

`bun run typecheck` is the only automated gate in this repo and it already fails.
Without a green typecheck and a runnable test script, later pairing/security/perf
plans have no machine-checkable done criteria. This plan unblocks every other plan.

## Current state

- `package.json` — scripts include `typecheck` only; no `test`, `lint`, or `check`:
  ```json
  "typecheck": "tsc --noEmit && tsc --noEmit -p server/tsconfig.json"
  ```
- `vite.config.ts:18-27` — debug middleware types `chunks` as `Buffer[]` and passes
  them to `Buffer.concat`, which fails under current TypeScript/`@types/node` typing:
  ```ts
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(Buffer.from(c)));
  // ...
  Buffer.concat(chunks).toString("utf8") + "\n",
  ```
  Observed error from `bun run typecheck`:
  `vite.config.ts(26,29): error TS2345: Argument of type 'Buffer[]' is not assignable to parameter of type 'readonly Uint8Array<ArrayBufferLike>[]'.`
- `tsconfig.json` — includes `vite.config.ts`; excludes `src/bun` (leave that exclusion alone in this plan).
- Zero `*.test.ts` / `*.spec.ts` files exist; no test runner configured.
- Package manager is **Bun** (`bun.lock`, scripts use `bun run`).
- Commit message style in recent history is mixed (`feat:`, `change:`, imperative sentences). Prefer short imperative subjects, e.g. `Fix typecheck and add bun test baseline.`

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                          | exit 0, no errors   |
| Tests     | `bun test`                                   | exit 0 (after Step 3 adds at least one test) |
| Check     | `bun run check` (after you add the script)    | exit 0              |

## Scope

**In scope** (the only files you should modify / create):
- `vite.config.ts`
- `package.json`
- `plans/README.md` (status row only)
- One new smoke test file: `src/lib/utils.test.ts` (or `src/lib/utils.spec.ts` if you prefer Bun’s default discovery — Bun finds `*.test.ts` and `*.spec.ts`)

**Out of scope** (do NOT touch):
- `src/bun/**` — Electrobun main process stays excluded from typecheck (separate future plan).
- ESLint/Prettier full rollout — optional later; do not add ESLint configs in this plan unless needed for a script that is a thin alias. Prefer **not** adding ESLint here (keeps this plan focused).
- Pairing, geo, auth, Spotify, map code.
- Pinning `electrobun`/`vite` off `"latest"` (separate finding).

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Commit message style: short imperative, e.g. `Fix typecheck and add bun test baseline.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the `vite.config.ts` typecheck failure

Change the chunk accumulation so TypeScript accepts it. Preferred minimal fix — use `Uint8Array[]` (or `Buffer.from` into an array typed as `Uint8Array[]`) and concatenate without the Buffer/Uint8Array mismatch:

```ts
const chunks: Uint8Array[] = [];
req.on("data", (c) => {
  chunks.push(c instanceof Uint8Array ? c : Buffer.from(c));
});
req.on("end", () => {
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    const body = Buffer.concat(chunks as readonly Uint8Array[]).toString("utf8");
    // ...
```

If `Buffer.concat` still errors, fall back to:

```ts
const body = Buffer.from(
  chunks.reduce<number[]>((acc, c) => {
    acc.push(...c);
    return acc;
  }, []),
).toString("utf8");
```

or decode incrementally with `TextDecoder`. Keep plugin behavior identical (append one JSON/text line per POST).

**Verify**: `bun run typecheck` → exit 0, no errors.

### Step 2: Add `test` and `check` scripts

In `package.json` `scripts`:

```json
"test": "bun test",
"check": "bun run typecheck && bun test"
```

Do not add new dependencies — Bun’s built-in test runner is enough.

**Verify**: `bun run test` → runs (may report 0 tests until Step 3; exit 0 with “0 pass” is OK for this step, or fail with “No tests found” — if Bun exits non-zero with no tests, proceed immediately to Step 3).

### Step 3: Add one smoke unit test

Create `src/lib/utils.test.ts` that imports `cn` from `./utils` and asserts a trivial merge (match existing `clsx`/`tailwind-merge` behavior):

```ts
import { describe, expect, test } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("a", false && "b", "c")).toContain("a");
    expect(cn("a", false && "b", "c")).toContain("c");
  });
});
```

Adjust assertions to match whatever `cn` actually returns (read `src/lib/utils.ts` first).

**Verify**: `bun test` → exit 0, at least 1 pass.  
**Verify**: `bun run check` → exit 0.

## Test plan

- New file: `src/lib/utils.test.ts` — smoke coverage for `cn` only (proves the runner works).
- No existing test pattern in-repo; use `bun:test` (`describe`/`test`/`expect`) as above.
- Verification: `bun test` → all pass.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0 with ≥1 passing test
- [ ] `package.json` has `test` and `check` scripts
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- After fixing `vite.config.ts`, `bun run typecheck` still fails on **other** files — report the full error list; do not mass-fix unrelated type errors unless they are one-line obvious fallout from this change.
- Bun test runner is unavailable or requires a package that cannot be installed with the repo’s Bun version.
- The drift check shows `vite.config.ts` already fixed differently — reconcile with live code; if typecheck is already green, still add `test`/`check` + smoke test only.

## Maintenance notes

- Later plans (006 pairing tests, perf tests) should use `bun:test` and `bun run check`.
- Reviewers: ensure the debug log plugin still writes UTF-8 lines to `.cursor/debug-playlist.log` on POST `/__debug_log`.
- Deferred: ESLint, CI workflow, including `src/bun` in typecheck, pinning `"latest"` deps.
