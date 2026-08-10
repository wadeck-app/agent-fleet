# Quality Audit — Wave 2 (2026-08-10)

## Findings

### F1 — WorkerPool `activeCount` double-decrement (High → Fixed in wave 1)
Already reported in wave 1. Fixed.

### F2 — WorkerPool `removeWorker` decrements for unregistered WebSockets (High → Fixed)
**File:** `src/daemon/WorkerPool.ts:75-78`
**Problem:** `removeWorker` unconditionally decremented `activeCount` even when the WebSocket was never registered — double-decrement with the `exit` handler.
**Fix:** `removeWorker` no longer decrements `activeCount`. Managed exclusively by `exit` handler.

### F3 — CommandHandler: `daemonDir` required even when stores injected (Low → Documented)
**File:** `src/daemon/CommandHandler.ts`
**Problem:** `daemonDir` is always required but unused when stores are injected.
**Status:** Low priority, not fixed to avoid breaking existing callers.

### F4 — Daemon.ts uninitialized `let` bindings used in closures (Low → Documented)
**File:** `src/daemon/Daemon.ts:34-39`
**Problem:** `logWriter`, `executionStore`, etc. assigned in `onStart` but referenced in `handleWorkerMessage` before TypeScript can verify order.
**Status:** Safe at runtime (daemon must start before accepting commands). Not fixed.

### F5 — McpServer.stop() null too early (Low → Fixed in wave 1)
Already fixed.

### F6 — Worker.ts has zero test coverage (Medium → Documented)
**File:** `src/worker/Worker.ts`
**Problem:** Entry-point binary with WebSocket message dispatch logic, 0% tests.
**Status:** Extracting to testable `WorkerController` class is tracked for v2 refactor.

### F7 — TestHelpers creates new store/writer per message (Low → Not fixed)
**File:** `src/test-utils/TestHelpers.ts:61-62`
**Problem:** `new ExecutionStore()` and `new LogWriter()` allocated on every message.
**Status:** Functionally correct (stateless wrappers). Low priority.

### F8 — LogWriter unvalidated `entry.level` (Low → Not fixed)
**File:** `src/storage/LogWriter.ts`
**Problem:** `entry.level` written to NDJSON without type validation.
**Status:** Worker is trusted per threat model. Not fixed.

### F9 — StepQueue silent no-op on unknown executionId (Low → Not fixed)
**File:** `src/daemon/StepQueue.ts`
**Problem:** `onStepCompleted`/`onStepFailed` return silently on unknown id, making post-mortem debugging hard.
**Status:** Intentional design (race-safe). Not fixed.
