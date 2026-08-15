# Maintenance Audit V2

**Scope:** `daemon/Daemon.ts`, `daemon/CommandHandler.ts`, `daemon/WorkerPool.ts`, `daemon/StepQueue.ts`, `worker/Worker.ts`, `worker/WorkerAdapter.ts`, `storage/ExecutionStore.ts`, `storage/LogWriter.ts`, `hooks/HookDispatcher.ts`

---

## HIGH

### H1 — ExecutionStore: read-then-write with no lock (lost-update race)

**FILE:LINE:** `src/storage/ExecutionStore.ts:66-70`
**CATEGORY:** race

All mutating methods (`markStepRunning`, `markStepCompleted`, `markStepFailed`, `markExecutionCompleted`, `markExecutionFailed`) follow `read() → mutate → write()` with no mutex. With `concurrency > 1`, two parallel `step_completed` events can race: both threads read the same state file, each appends its own mutation, and the second `writeFileSync` silently drops the first update. The lost update leaves `currentSteps` and step statuses permanently inconsistent on disk — the in-memory `StepQueue` says the execution is done while the persisted `ExecutionState` still shows steps as `running`.

**Fix:** Introduce a per-executionId promise-chain lock (a `Map<string, Promise<void>>`) that serialises calls to `update()`. Each mutating method acquires the chain before reading and holds it through the write.

---

### H2 — Daemon.ts: hookDispatcher is per-run mutable shared state on CommandHandler

**FILE:LINE:** `src/daemon/Daemon.ts:62-63`
**CATEGORY:** race

Each `run` command calls `commandHandler.setHookDispatcher(new HookDispatcher(flowHooks))`. `CommandHandler.hookDispatcher` is a single mutable field (`CommandHandler.ts:22`). With concurrent clients, the second `run` overwrites the dispatcher that was set for the first, so in-flight hooks for execution A fire under execution B's hook config (or no hooks at all if the second run arrives after A's `onFlowStart`).

**Fix:** Pass the resolved `HookDispatcher` as a parameter to `handleRun()` rather than storing it on the shared instance. Each execution keeps its own dispatcher reference; `CommandHandler` becomes stateless with respect to hook config.

---

### H3 — WorkerAdapter: accesses StepRunner private config via `any` cast

**FILE:LINE:** `src/worker/WorkerAdapter.ts:54`
**CATEGORY:** coupling

`(this.stepRunner as any).config` reads a field not in `StepRunner`'s public API, then constructs a new `StepRunner` by spreading that internal config. If `flow-engine` renames or restructures its config field, the failure is invisible at compile time and crashes at runtime on the first model step, with no diagnostic except a `Cannot read properties of undefined` error.

**Fix:** Request a `StepRunner.withEnv(env: Record<string, string>): StepRunner` factory method from `flow-engine`. Until that is available, document the exact field name and the `flow-engine` version that guarantees it, and add a runtime assertion: `if (!originalConfig) throw new Error('StepRunner.config is not accessible — flow-engine version mismatch')`.

---

### H4 — Daemon.ts: handleWorkerMessage is a god closure coupling all subsystems

**FILE:LINE:** `src/daemon/Daemon.ts:88-170`
**CATEGORY:** coupling

`handleWorkerMessage` directly orchestrates `executionStore`, `stepQueue`, `logWriter`, `commandHandler`, and `workerPool` across ~80 lines. Every step lifecycle change (adding retry logic, changing completion semantics, adding metrics) requires editing this single closure that owns no invariants of its own. It also duplicates completion-detection logic (`allDone` at line 110-122) that is separately tracked by `StepQueue.onStepCompleted`.

**Fix:** Extract a `StepLifecycleHandler` class (or move the responsibility into `CommandHandler`) that accepts `ExecutionStore`, `LogWriter`, and `StepQueue` as constructor dependencies and exposes `onStepCompleted(executionId, stepId, output)` and `onStepFailed(executionId, stepId, error)` methods.

---

### H5 — CommandHandler.handleRun: workspaceManager.allocate() has no error handling

**FILE:LINE:** `src/daemon/CommandHandler.ts:76-80`
**CATEGORY:** error-handling

`const workspace = await workspaceManager.allocate(...)` is not wrapped in try/catch. If it throws (disk full, workspace lock timeout, permission error), the rejection propagates out of the `run` command handler in `Daemon.ts:59-65` with no structured error response to the client. The execution state is never created, so no cleanup is needed, but the client receives an unhandled-rejection crash rather than a clean `{ type: 'error' }` response.

**Fix:** Wrap in try/catch and return `{ type: 'error', code: 'WORKSPACE_ERROR', message: String(err) }`.

---

## MEDIUM

### M1 — WorkerPool: `child.pid!` non-null assertion on spawn

**FILE:LINE:** `src/daemon/WorkerPool.ts:46`
**CATEGORY:** error-handling

`const pid = child.pid!` uses a non-null assertion. On Windows or under resource pressure, `child.pid` can be `undefined` when `spawn()` fails to assign a PID before the error event fires. This would throw a runtime exception in `spawnWorker()` and leave `activeCount` incremented without a corresponding decrement.

**Fix:** `if (child.pid === undefined) { this.activeCount--; process.stderr.write('[WorkerPool] spawn produced no PID — aborting\n'); return; }`

---

### M2 — WorkerPool: hardcoded path to compiled worker output

**FILE:LINE:** `src/daemon/WorkerPool.ts:27`
**CATEGORY:** hardcoded

`fileURLToPath(new URL('../../dist/worker/Worker.js', import.meta.url))` encodes the `dist/` output layout as a constant. Any restructure of the tsconfig `outDir` or package layout silently breaks worker spawning with a `ENOENT` at runtime rather than a build error.

**Fix:** Expose the worker path via an env variable (`FLOW_WORKER_PATH`) with a documented fallback, or centralise the path in a `paths.ts` constants file imported by both `WorkerPool` and the build config.

---

### M3 — Worker.ts: JSON parse failure on daemon messages silently swallowed

**FILE:LINE:** `src/worker/Worker.ts:28-30`

**CATEGORY:** error-handling

`catch { return; }` on `JSON.parse` of an incoming daemon message produces zero output. A malformed message from a daemon version mismatch causes the worker to silently do nothing — it sits idle indefinitely, holding a concurrency slot, with no trace in logs.

**Fix:** `catch (err) { process.stderr.write(`[worker] failed to parse daemon message: ${String(err)}\n`); }`

---

### M4 — HookDispatcher: inner `.catch(() => {})` makes outer error handler dead code

**FILE:LINE:** `src/hooks/HookDispatcher.ts:41` and `src/daemon/CommandHandler.ts:35-38`
**CATEGORY:** error-handling

`dispatch()` wraps each hook in `.catch(() => {})`, completely silencing all individual hook errors. `CommandHandler.dispatchHook()` attaches its own outer `.catch` that logs to `logWriter`, but because `dispatch()` never rejects, the outer catch can never fire. Hook failures are invisible in the logs.

**Fix:** Remove the inner `.catch(() => {})` and let `CommandHandler`'s outer catch handle logging, OR pass a `onHookError?: (event: HookEvent, err: Error) => void` callback into `dispatch()` and invoke it in the inner catch before swallowing.

---

### M5 — StepQueue.injectSteps: intra-batch dependency validation is broken

**FILE:LINE:** `src/daemon/StepQueue.ts:62-76`
**CATEGORY:** error-handling

The dependency validation loop checks `entry.steps.has(dep)` before the batch is added to `entry.steps`. Intra-batch forward references (step B depends on step A where both are in the same `inject_steps` call) always fail with "Dependency step X does not exist in execution". The comment at line 78 reads "Add all steps first (so cross-references within the batch work after validation)" — this describes post-validation scheduling but the validation itself doesn't use the batch. This is misleading and the validation is silently wrong.

**Fix:** Pre-collect batch IDs (`const batchIds = new Set(injectedSteps.map(s => s.id))`) and validate against `entry.steps ∪ batchIds`, OR update the comment to explicitly state that intra-batch forward dependencies are unsupported.

---

### M6 — StepQueue.injectSteps: InjectedStep cast to AssignableStep without field validation

**FILE:LINE:** `src/daemon/StepQueue.ts:80`
**CATEGORY:** error-handling

`const step = injected as unknown as AssignableStep` casts the unvalidated wire payload directly. `McpServer.ts` validates field names and type strings but not type-specific required sub-fields (e.g. `prompt` for model steps, `script` for script steps). A malformed model step with no `prompt` reaches workers without a validation error.

**Fix:** Add a `validateInjectedStepFields(step: InjectedStep): void` that checks type-specific required fields, throwing on violations before the cast.

---

### M7 — CommandHandler.handleRun: duplicate generateExecutionId() calls

**FILE:LINE:** `src/daemon/CommandHandler.ts:77, 83`
**CATEGORY:** hidden-dep

`generateExecutionId()` is called once at line 77 (passed as workspace `taskId`, result discarded) and again at line 83 (the actual `executionId`). These two IDs diverge silently. If workspace cleanup or audit tooling ever needs to cross-reference execution IDs with workspace IDs, the mismatch will be a latent bug.

**Fix:** Generate `executionId` once before `allocate()` and pass the same value as `taskId`.

---

### M8 — CommandHandler.tryDispatch: sendToWorker failure is silent; step hangs

**FILE:LINE:** `src/daemon/CommandHandler.ts:138-143`
**CATEGORY:** error-handling

After `markBusy` and `markStepActive` are called, `workerPool.sendToWorker()` is a no-op if the WebSocket is not `OPEN` (`WorkerPool.ts:114-116`). The step is recorded as active in both `StepQueue` and `ExecutionStore` but never executed — the execution hangs indefinitely with no error surfaced.

**Fix:** `sendToWorker` should return a boolean indicating success. On failure, immediately reverse `markBusy` (call `markIdle`) and requeue the step, and log the worker loss.

---

### M9 — WorkerAdapter: mcpServer.stop() error shadows executeStep error

**FILE:LINE:** `src/worker/WorkerAdapter.ts:63-68`
**CATEGORY:** error-handling

In the `finally` block, `await mcpServer.stop()` can throw (e.g. already-closed server). If `executeStep()` also threw, the `stop()` error propagates instead of the original step error, masking the real failure.

**Fix:** Wrap `mcpServer.stop()` in its own try/catch inside `finally` and log but suppress stop errors.

---

### M10 — LogWriter.rotate() called synchronously on every write

**FILE:LINE:** `src/storage/LogWriter.ts:43-44, 67-89`
**CATEGORY:** resource-leak

`rotate()` is invoked at the end of every `write()` and `writeExecution()` call. On the first write of a new calendar day, `readdirSync` + sort + `unlinkSync` run synchronously on the Node.js event loop. Under high step-log volume (many parallel steps), this is a blocking latency spike per-write until rotation completes.

**Fix:** Move rotation to a dedicated `scheduleRotation()` that runs once at daemon startup and once per day via `setInterval`, entirely off the log-write hot path.

---

## LOW

### L1 — `'__hook'` magic string lacks a named constant

**FILE:LINE:** `src/daemon/CommandHandler.ts:36`
**CATEGORY:** hardcoded

The literal `'__hook'` is used as a sentinel executionId for hook error log entries. Without a named constant, a reader cannot find all usages or understand the convention. `LogWriter.ts` documents the convention in a comment but does not define the constant.

**Fix:** `export const HOOK_LOG_EXECUTION_ID = '__hook'` in a shared constants file; import it in `CommandHandler` and `LogWriter`.

---

### L2 — WORKER_CONNECT_TIMEOUT_MS not configurable

**FILE:LINE:** `src/daemon/WorkerPool.ts:10`
**CATEGORY:** hardcoded

The 10-second connect timeout is not part of `FlowConfig`. On slow startup machines or under heavy I/O, legitimate workers can miss this window and be killed, causing the concurrency slot to be wasted and the spawning loop to retry.

**Fix:** Accept `connectTimeoutMs?: number` as an optional `WorkerPool` constructor parameter defaulting to `10_000`.

---

### L3 — StepQueue.onStepCompleted/onStepFailed silently ignores unknown executionId

**FILE:LINE:** `src/daemon/StepQueue.ts:110`
**CATEGORY:** error-handling

`if (!entry) return;` discards step completions for unknown executions without logging. This masks bugs where a late `step_completed` arrives after the execution was purged due to a prior failure.

**Fix:** `if (!entry) { process.stderr.write(...); return; }`

---

### L4 — LogWriter: HARD_CAP silently overrides configured retainDays

**FILE:LINE:** `src/storage/LogWriter.ts:5, 71`
**CATEGORY:** hardcoded

When `retainDays > 120`, the cap is applied without warning. A user configuring `retainDays: 180` observes 120-day retention silently.

**Fix:** On construction, if `retainDays > HARD_CAP`, emit a one-time warning: `process.stderr.write('[LogWriter] retainDays capped at 120 (HARD_CAP)\n')`.

---

### L5 — ExecutionStore.pruneOldExecutions: readdirSync not wrapped in try/catch

**FILE:LINE:** `src/storage/ExecutionStore.ts:27`
**CATEGORY:** error-handling

`fs.readdirSync(this.executionsDir)` is not wrapped. If the directory is inaccessible at startup (permissions, concurrent mount), it throws unhandled and crashes the daemon's `onStart` hook before the daemon is usable.

**Fix:** Wrap the `readdirSync` call and log to stderr rather than propagating.

---

### L6 — WorkerAdapter: workspace mode hardcoded to `'manual'`

**FILE:LINE:** `src/worker/WorkerAdapter.ts:29`
**CATEGORY:** hardcoded

`mode: 'manual'` is fixed. If `flow-engine` adds mode-sensitive behavior (e.g. resource cleanup, concurrency gating per workspace mode), all steps from this codebase will silently bypass those code paths.

**Fix:** Derive the workspace mode from `step.workspaceStrategy` if present, or accept it as an `ExecutionContext` field.

---

## Score: 5/10

The codebase has a coherent design with several well-considered protections (PID-based worker registration, execution ID validation, HARD_CAP on injected steps, double-settle guard in HTTP hooks). However, three systemic issues will cause data corruption or silent failures under real-world concurrent workloads: the unguarded read-then-write race in `ExecutionStore` (H1), the per-run mutation of a shared `hookDispatcher` (H2), and the completely silenced hook error path that makes `CommandHandler`'s outer catch dead code (M4). These must be fixed before raising concurrency above 1 or deploying in a multi-client environment.
