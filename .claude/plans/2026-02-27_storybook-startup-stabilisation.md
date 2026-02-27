# Storybook E2E Startup Stabilisation

## Problem

The "E2E Component Functional Tests" suite fails intermittently with:

```
❌ Failed to start Storybook: Storybook startup timeout
Error: Process from config.webServer was not able to start. Exit code: 1
```

## Root Cause

`packages/e2e-web/scripts/start-storybook-with-retry.js` starts Storybook on a dynamically
chosen port and waits for `"Local:"` in stdout to confirm readiness. If not seen within **10s**,
it kills the process and assumes a port conflict.

Two problems compound:

**1. Port conflict → silent interactive prompt**
When the chosen port is taken, Storybook displays an interactive prompt instead of exiting:

```
Port 6100 is not available. Would you like to run Storybook on port 6101 instead? » (Y/n)
```

No `EADDRINUSE` in stderr, no process exit — the script gets no signal. The 10s timeout is
the only escape hatch.

**2. 10s timeout is too short for normal compilation**
Cold-start compilation takes ~7s on this machine. The 2-3s margin is insufficient under any
load, so the timeout fires as a false "port conflict" even when Storybook is just compiling.

## Measured Data

| Scenario                        | Duration |
| ------------------------------- | -------- |
| `storybook dev` cold start      | ~7s      |
| `storybook build` (full static) | ~17s     |
| `serve` static files startup    | < 1s     |
| 10s timeout margin              | ~2-3s    |

## What Was Ruled Out

**`--ci` flag**: tested on Storybook 8.6.14. It does NOT exit on port conflict — it
silently auto-picks the next available port. This breaks the core requirement: the script must
control which port is used so it can write the correct port to the JSON file read by tests.
Parallel runs could end up on the same auto-picked port.

---

## Two Options

### Option A — Detect the interactive prompt (minimal change)

Add stdout detection of the port-conflict prompt string. Kill immediately and retry, just like
`EADDRINUSE`. Remove the dependency on the 10s timeout as a conflict detector — increase it
to 35s as a safety net for genuine crashes only.

**Files to modify:** `packages/e2e-web/scripts/start-storybook-with-retry.js`

**Change 1** — In the stdout watcher (~line 144), add prompt detection alongside `"Local:"`:

```js
if (text.includes('Would you like to run Storybook on port') && !startupComplete) {
	hasError = true;
	killProcessTree(storybookProcess);
	rejectPromise(new Error('PORT_IN_USE'));
}
```

**Change 2** — Increase the safety-net timeout from 10s to 35s (~line 218):

```js
}, 35000); // Safety net for genuine crashes — not a port conflict detector
```

**Pros:** minimal change, targets the exact failure mode, preserves the full existing architecture
**Cons:** still depends on Storybook's stdout format (prompt string could change between versions)

---

### Option B — Pre-build static Storybook (structural fix)

Replace `storybook dev` with `storybook build` + a static file server. The server starts in
< 1s — no compilation on test run, no interactive prompt, port fully controlled by the script.

**Isolation:** each worktree builds its own static output. The build must NOT be shared between
workspaces (would break worktree isolation — ws2 would test ws1's compiled code).

**Files to modify:**

- `packages/web-frontend/package.json` — add a `storybook:build-e2e` script
- `packages/e2e-web/scripts/start-storybook-with-retry.js` — replace `storybook dev` spawn
  with `serve` (or `http-server`) on the pre-built output directory
- `packages/e2e-web/package.json` — add `serve` or `http-server` as dev dependency;
  add a `test:components:build` pre-step script

**Implementation sketch:**

```
// Pre-step (run once before test suites start)
npm run storybook:build-e2e --workspace=web-frontend
// → outputs to packages/e2e-web/temp/storybook-static/

// In start-storybook-with-retry.js, replace:
spawn('npm run storybook:only-for-e2e ...')
// with:
spawn('npx serve packages/e2e-web/temp/storybook-static -p PORT -l PORT --no-clipboard --no-port-switching')
```

A static server exits immediately with `EADDRINUSE` on port conflict — the existing retry
logic handles it without any changes to the retry loop. The 10s timeout can stay or be
reduced to 5s (static server is up in < 1s).

**Pros:**

- Eliminates all startup fragility (no compilation, no prompts)
- Standard CI/CD approach
- Port entirely controlled by the script

**Cons:**

- Requires a build step before running the suite (~17s, once per worktree per session)
- Stories must be rebuilt after component changes (during development)
- More moving parts (build output directory, serve dependency)

---

## Recommendation

**Start with Option A** — it is a two-line change that directly addresses the failure mode.
**Option B** is the right long-term direction if this suite moves toward a dedicated CI pipeline
or if Option A proves insufficient (e.g. Storybook changes its prompt string).

## Verification (both options)

1. Run `npm run test:agent -- --suite="E2E Component*"` 5 consecutive times — must be stable
2. Simulate port conflict (occupy port 6100 before running) — must retry and succeed on next port
3. `npm run check` must pass
4. `npm run test:agent` full suite must pass
