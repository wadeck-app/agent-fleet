# Maintenance Audit V3

Audited: Daemon.ts, CommandHandler.ts, WorkerPool.ts, StepQueue.ts, Worker.ts, WorkerAdapter.ts, ExecutionStore.ts, LogWriter.ts, HookDispatcher.ts

---

## FIXED since V2

- **H5**: `workspaceManager.allocate()` wrapped in try/catch (CommandHandler.ts:99-107).
- **M5**: StepQueue intra-batch dependency validation fixed (allKnownIds).
- **M7**: Duplicate `generateExecutionId()` calls merged into one.
- **L3**: `loadFlowHooks` parse errors now logged to stderr.

---

## HIGH

### H2 — HookDispatcher mutable field on CommandHandler

**FILE:LINE:** `Daemon.ts:63`, `CommandHandler.ts:22-30`

`setHookDispatcher()` stores a dispatcher as a mutable field shared across all concurrent executions. Under `concurrency > 1`, the second `run` call replaces the first execution's dispatcher mid-flight. Hook callbacks for execution A fire with execution B's hook config — or not at all if the second run arrives after A's `onFlowStart` already fired.

**Fix:** Add `hookDispatcher?: HookDispatcher` parameter to `handleRun()`. Remove `setHookDispatcher()`. Daemon passes the freshly created dispatcher directly into `handleRun`.

---

### H4 — handleWorkerMessage is a god closure

**FILE:LINE:** `Daemon.ts:89-178`

The closure directly orchestrates `executionStore`, `stepQueue`, `logWriter`, `commandHandler`, and `workerPool`. Adding retry, metrics, or tracing requires editing this closure. The `allDone` check at lines 110-124 duplicates completion-detection logic that StepQueue also tracks internally.

**Status:** Structural refactor deferred to v2. Not an active defect; tracked as a maintenance debt.

---

## MEDIUM

### M3 — Worker.ts: JSON parse failure silently swallowed

**FILE:LINE:** `Worker.ts:29`

```ts
catch { return; }
```

A malformed message from the daemon (version mismatch, truncated frame) causes the worker to silently do nothing. The worker sits idle holding a concurrency slot; the daemon sees it as idle and re-dispatches steps that then also silently disappear.

**Fix:** `catch (err) { process.stderr.write('[worker] failed to parse daemon message: ' + String(err) + '\n'); }`

---

### M4 — HookDispatcher inner `.catch(() => {})` makes outer error log dead code

**FILE:LINE:** `HookDispatcher.ts:41`, `CommandHandler.ts:34-38`

`dispatch()` attaches `.catch(() => {})` to every individual hook call. Since errors are swallowed inside, `dispatch()` never rejects. The outer `.catch(err => logWriter.writeExecution(...))` in `CommandHandler.dispatchHook` can never fire. Hook failures are invisible — no log entry, no metric, nothing.

Per D32, hook failures are intentionally ignored (on-failure default: ignore). But "ignore" should not mean "prevent logging" — the diagnostic value is lost.

**Fix:** Add `onError?: (err: unknown) => void` callback parameter to `dispatch()`. Call `onError(err)` in the inner catch before swallowing. `CommandHandler.dispatchHook` passes a callback that calls `logWriter.writeExecution`. This preserves D32 semantics while restoring log visibility.

---

### M8 — sendToWorker is a no-op when WebSocket is not OPEN; step hangs indefinitely

**FILE:LINE:** `WorkerPool.ts:113-117`, `CommandHandler.ts:155-161`

`sendToWorker` does nothing if `ws.readyState !== ws.OPEN`. The step is already marked running in ExecutionStore and active in StepQueue, but it is never executed. The execution hangs indefinitely with no error.

**Fix:** `sendToWorker` should return a boolean. On `false`, `CommandHandler.tryDispatch` should call `workerPool.markIdle(idleWorker)`, un-mark the step in StepQueue, and revert `markStepRunning` in ExecutionStore, then log the failure.

---

### M9 — `mcpServer.stop()` error in `finally` shadows the original `executeStep` error

**FILE:LINE:** `WorkerAdapter.ts:66-68`

```ts
} finally {
    await mcpServer.stop();
}
```

If `executeStep` throws and then `mcpServer.stop()` also throws, the stop error propagates, hiding the original step failure. The worker sends `step_failed` with the wrong error message.

**Fix:** Wrap in its own try/catch inside `finally`:
```ts
} finally {
    try { await mcpServer.stop(); } catch { /* ignore stop errors */ }
}
```

---

### M1 — `child.pid!` non-null assertion

**FILE:LINE:** `WorkerPool.ts:46`

On Windows or under resource pressure, `child.pid` can be `undefined` when spawn fails. The non-null assertion throws with a confusing error and leaves `activeCount` permanently inflated.

**Fix:** `if (child.pid === undefined) { this.activeCount--; process.stderr.write('[WorkerPool] spawn produced no PID\n'); return; }`

---

### M2 — Hardcoded `dist/worker/Worker.js` path

**FILE:LINE:** `WorkerPool.ts:27`

The output path is encoded as a constant. Any tsconfig `outDir` or package restructure breaks spawning silently at runtime.

**Status:** Low-risk for v1; document in CLAUDE.md as a known fragility.

---

## LOW

### L4 — LogWriter: HARD_CAP applied silently when retainDays > 120

**FILE:LINE:** `LogWriter.ts:5, 71`

`retainDays > 120` is capped without logging. A user who sets `retainDays: 180` sees 120-day retention with no warning.

**Fix:** On construction, emit one-time warning if `retainDays > HARD_CAP`.

---

### L5 — ExecutionStore.pruneOldExecutions: readdirSync not wrapped

**FILE:LINE:** `ExecutionStore.ts:27`

`fs.readdirSync(this.executionsDir)` is not wrapped. A permissions error crashes the daemon's `onStart` hook. All other fallible operations in the file are properly wrapped.

**Fix:** Wrap in try/catch with a stderr log.

---

## Score: 6/10

Key improvements since V2: workspace allocate error handling fixed, duplicate executionId fixed, intra-batch deps fixed. Remaining issues: HookDispatcher mutable state (H2, concurrent hook misfiring), M4 dead-code outer error log, M8 silent step hang, M9 error shadow. All are fixable this iteration except H2 (requires handleRun signature change) and H4 (structural debt).
