# Quality & Maintainability Audit — Wave 1 (2026-08-10)

## Findings

### F1 — WebSocketServer HTTP server leak (High → Fixed)
**File:** `src/daemon/WebSocketServer.ts`
**Problem:** `http.createServer()` stored in a local variable, never closed. `close()` only closed the WS server, leaving the port bound forever.
**Fix:** Stored as `this.httpServer`, `close()` now calls both `this.wss.close()` and `this.httpServer.close()`.

### F2 — WorkerPool connect timeout SIGKILL on healthy worker (High → Fixed)
**File:** `src/daemon/WorkerPool.ts`
**Problem:** `setTimeout` started in `spawnWorker()` but `registerWorker()` had no reference to cancel it. After 10s, a successfully-connected worker was SIGKILLed.
**Fix:** Added `pendingConnectTimeouts: Map<pid, timeout>`. `registerWorker(ws, pid)` now cancels the timer.

### F3 — WorkerPool `activeCount` double-decrement (High → Fixed)
**File:** `src/daemon/WorkerPool.ts`
**Problem:** `activeCount` decremented in both `child.on('exit')` and `removeWorker()` → drops below true value → spawns excess workers.
**Fix:** `removeWorker()` no longer decrements. Only the `exit` handler manages `activeCount`.

### F4 — RunCommand `--input=keyonly` silent undefined (High → Fixed)
**File:** `src/cli/RunCommand.ts`
**Problem:** `split('=', 2)` on `--input=keyonly` produces `['keyonly']` → `v` is `undefined`, assigned silently.
**Fix:** Uses `indexOf('=')` + slice. Exits 1 with error message if no `=` found.

### F5 — TaskStore.readIndex() unprotected JSON.parse (Medium → Fixed)
**File:** `src/task/TaskStore.ts`
**Problem:** Corrupted `index.json` throws unhandled `SyntaxError`.
**Fix:** Wrapped in try/catch, rethrows with descriptive message.

### F6 — FlowValidator default case silent (Low → Fixed)
**File:** `src/validation/FlowValidator.ts`
**Problem:** `validationCodeToType()` default case returned `'schema'` silently for unknown codes.
**Fix:** Now throws `new Error('Unknown ValidationCode: ...')`.

### F7 — RunCommand config parse silent (Low → Fixed)
**File:** `src/cli/RunCommand.ts`
**Problem:** Invalid `~/.flow-config.yaml` silently fell back to defaults.
**Fix:** Now writes warning to `process.stderr`.

### F8 — McpServer `stop()` nulls server too early (Low → Fixed)
**File:** `src/worker/McpServer.ts`
**Problem:** `this.server = null` set before `server.close()` callback fires — concurrent `stop()` calls could resolve prematurely.
**Fix:** Local variable captures the server reference before nulling `this.server`.

### F9 — CommandHandler DI: ExecutionStore/LogWriter not injectable (Medium → Fixed)
**File:** `src/daemon/CommandHandler.ts`
**Problem:** Constructor created stores internally, making testing hard.
**Fix:** Added optional `executionStore` and `logWriter` constructor parameters.

### F10 — StepExecutor: internal dependencies not injectable (Medium → Documented)
**File:** `src/worker/StepExecutor.ts`
**Problem:** `ScriptExecutor`, `ClaudeLauncher`, `OutputExtractor`, `TemplateRenderer` created as private fields, not injectable.
**Status:** Tests work via property access workarounds. Low priority; not fixed to avoid scope creep.

### F11 — TestHelpers duplicates Daemon.ts logic (Medium → Partially fixed)
**File:** `src/test-utils/TestHelpers.ts`
**Problem:** `handleWorkerMessage` is near-copy of `Daemon.ts` logic.
**Fix:** `inject_steps` case now calls `commandHandler.tryDispatch()` (was missing). Full deduplication deferred.

### F12 — Missing unit tests for RunCommand, ValidateCommand, CommandHandler, WorkerPool (Medium → Fixed)
**Problem:** 0% coverage on 4 key classes.
**Fix:** Created test files for all 4 classes (+45 tests total).
