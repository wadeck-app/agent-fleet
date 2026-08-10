# Quality & Maintainability Audit — Wave 3 (2026-08-10)

## Findings

### F-ERR-1 — ExecutionStore.ts: readFileSync outside try/catch (High → Fix)
**File:** `src/storage/ExecutionStore.ts:63`
**Problem:** `readFileSync` throws raw `ENOENT` on missing file, not the structured error. try/catch only covers `JSON.parse`.
**Fix:** Extend try/catch to wrap both `readFileSync` and `JSON.parse`.

### F-ERR-2 — Daemon.ts: unguarded I/O in handleWorkerMessage (High → Fix)
**File:** `src/daemon/Daemon.ts:98-133`
**Problem:** `executionStore.markStepCompleted()`, `executionStore.read()`, `logWriter.writeExecution()` all uncaught in WebSocket message handler. Disk-full or deleted directory crashes daemon process.
**Fix:** Wrap each case body in try/catch, log error and continue.

### F-ERR-3 — LogWriter.ts: appendFileSync uncaught (Medium → Fix)
**File:** `src/storage/LogWriter.ts:37,48`
**Problem:** `appendFileSync` throws on full disk or deleted log directory, propagates to daemon message handler → crash.
**Fix:** Wrap `appendFileSync` in try/catch, write to `process.stderr` on failure.

### F-ERR-4 — HookDispatcher.ts: no timeout on hooks (Medium → Fix)
**File:** `src/hooks/HookDispatcher.ts:64,68`
**Problem:** `execFileAsync` has no `timeout` option. HTTP request has no socket timeout. Hung subprocess or non-responding server blocks Promise indefinitely.
**Fix:** `{ timeout: 10000 }` on `execFileAsync`; `req.setTimeout(10000, () => req.destroy())` on HTTP.

### F-ERR-5 — McpServer.ts: resolve after reject possible (Low → Not fixed)
**File:** `src/worker/McpServer.ts:259`
**Problem:** `req.destroy()` can trigger `'end'` event in some Node.js versions, calling `resolve(body)` after `reject()`. Settled Promise ignores it — safe in practice.
**Status:** Not fixed; behavior is harmless but noted.

### F-COV-1 — Daemon.ts: no unit test file (Medium → Not fixed)
**Status:** `startDaemon` is covered by EndToEnd test. Extracting a full unit test requires significant refactor. Deferred.

### F-COV-2 — Worker.ts: no unit test file (Medium → Not fixed)
**Status:** Worker entry point is difficult to unit-test. Deferred to v2 WorkerController refactor.

### F-COV-3 — FlowIndex.ts: no test file (Low → Not fixed)
**Status:** Trivial dispatch switch. Not fixed.

### F-DUP-1 — TestHelpers duplicates Daemon handleWorkerMessage (High → Not fixed)
**Status:** Refactoring test infrastructure risks introducing bugs mid-audit. Deferred.

### F-DUP-2 — TaskIndex.ts: approve/set-status duplication (Medium → Not fixed)
**Status:** Low risk, low priority. Deferred.

### F-NAME-1 — checkShutdown() misleading name (Low → Not fixed)
**Status:** Cosmetic. Deferred.

### F-NAME-2 — activeCount vs hasActiveWorkers naming conflict (Low → Not fixed)
**Status:** Cosmetic. Deferred.

### F-DI-1 — StepExecutor collaborators not injectable (Medium → Not fixed)
**Status:** Tests work via property mutation. Refactor deferred to v2.

### F-DI-2 — Daemon.ts: dual ExecutionStore/LogWriter instances (Medium → Fix)
**File:** `src/daemon/Daemon.ts:79`
**Problem:** `CommandHandler` creates its own stores internally; `handleWorkerMessage` uses separate instances from `onStart` closure. Two distinct object graphs write to same directory. Confusing but not a correctness bug.
**Fix:** Pass `onStart`-created instances to `CommandHandler` constructor.

### F-TYPE-2 — CommandHandler: yaml.load() can return null (Low → Fix)
**File:** `src/daemon/CommandHandler.ts:52`
**Problem:** Empty YAML file → `yaml.load()` returns `null` → `validator.validate(null)` crashes inside engine.
**Fix:** Guard: `if (!flow || typeof flow !== 'object') return { type: 'error', code: 'PARSE_ERROR', message: '...' }`.

### F-LEAK-1 — TestHelpers: ExecutionStore created per message (Low → Not fixed)
**Status:** No open handles; not a true leak.

### F-LEAK-2 — WorkerPool: worker stdout pipe buffer fills (Low → Fix)
**File:** `src/daemon/WorkerPool.ts:spawnWorker`
**Problem:** `spawn()` inherits stdout pipe. Worker writing to stdout fills buffer, blocks worker.
**Fix:** Pass `stdio: ['ignore', 'ignore', 'pipe']` and drain or ignore stderr.

### F-SOLID-2 — StepQueue: activeExecutions counter redundant (Low → Not fixed)
**Status:** `this.executions.size` would suffice but the refactor touches scheduling logic. Deferred.
