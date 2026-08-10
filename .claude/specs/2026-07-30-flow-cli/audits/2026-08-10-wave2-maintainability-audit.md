# Maintainability Audit — Wave 2 (2026-08-10)

## Findings

### F1 — Flow lifecycle hooks silently non-functional (High → Fixed)
**Files:** `src/daemon/Daemon.ts`, `src/daemon/CommandHandler.ts`
**Problem:** `HookDispatcher({})` hardcoded empty. `CommandHandler` constructed without dispatcher. All `onFlowStart`, `onStepStart`, etc. calls were no-ops. README documents hooks as working.
**Fix:** `loadFlowHooks(cmd.cwd)` reads `.flows/config.yml` top-level `hooks:` per run. `setHookDispatcher()` method added to `CommandHandler`.

### F2 — Stale tsc artifacts in dist/ (High → Fixed)
**Problem:** `dist/` contained old tsc-compiled test files from a previous build config. Cleaned by deleting dist/ and rebuilding with esbuild only.

### F3 — Duplicate EndToEnd test (Medium → Fixed)
**Problem:** `src/integration/EndToEnd.test.ts` existed alongside `src/__tests__/integration/EndToEnd.test.ts`.
**Fix:** Old location removed.

### F4 — Dead resolver branches in vitest.config.ts (Medium → Partially fixed)
**File:** `vitest.config.ts`
**Problem:** `shared-common` resolver was unused dead code.
**Fix:** `shared-common` branches removed. `shared-orch-worker` kept — used transitively via `flow-engine`.

### F5 — TestHelpers inject_steps missing tryDispatch (Medium → Fixed)
**File:** `src/test-utils/TestHelpers.ts`
**Problem:** Injected steps never dispatched immediately in test helper — integration tests would silently not schedule them.
**Fix:** Added `commandHandler.tryDispatch()` after `stepQueue.injectSteps()`.

### F6 — `markIdle` unused public method (Medium → Fixed)
**File:** `src/daemon/WorkerPool.ts`
**Problem:** No production caller. Dangling affordance suggesting incomplete design.
**Fix:** Removed from `WorkerPool` and its test.

### F7 — `--help` exits 1 but README says to use it as verification (Medium → Fixed)
**Files:** `src/cli/FlowIndex.ts`, `src/cli/TaskIndex.ts`
**Problem:** Both CLIs treated `--help` as unknown command → exit 1 with error.
**Fix:** Added `case '--help'` and `case undefined` → print usage, exit 0.

### F8 — Fixture path wrong in testing-scenarios.md (Low → Fixed)
**File:** `docs/testing-scenarios.md`
**Fix:** `tests/fixtures/hello-world.yml` → `src/test-utils/fixtures/hello-world.yml`.
