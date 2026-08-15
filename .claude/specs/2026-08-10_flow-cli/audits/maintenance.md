# Maintenance Audit

Scope: `packages/flow-cli/src` — daemon, worker, storage, hooks subsystems.
Date: 2026-08-12

---

## Findings

### 1. [HIGH] Duplicate `markIdle` method — `WorkerPool.ts:105–111` — Category: other

**Issue:** `markIdle` is declared twice (lines 105 and 109). TypeScript will raise a compile error (`Duplicate identifier`) or silently use the second declaration depending on the build config. Either way the class is broken by design; any future refactor that touches one copy while missing the other will introduce a silent behavioral divergence.

**Fix hint:** Delete the first occurrence (line 105–107). Add a lint rule (`no-dupe-class-members` is already on by default in TS strict mode — check why this passes the current build).

---

### 2. [HIGH] Mutable `hookDispatcher` mutated per-run on shared `CommandHandler` — `Daemon.ts:62–63` / `CommandHandler.ts:30` — Category: coupling

**Issue:** Every `run` command calls `commandHandler.setHookDispatcher(new HookDispatcher(flowHooks))` on the single shared `CommandHandler` instance. If two flows from different working directories run concurrently, the second `run` command overwrites the dispatcher while the first execution is still dispatching `onStepStart`/`onStepEnd` hooks. All mid-flight hook callbacks for the first flow will use the second flow's hook configuration.

**Fix hint:** Pass the `HookDispatcher` as a parameter to `handleRun` (or into each dispatched step) rather than storing it as mutable instance state. The dispatcher should be scoped to the execution, not the handler.

---

### 3. [HIGH] Read-modify-write on `ExecutionStore` with no file locking — `ExecutionStore.ts:66–69` — Category: resource-leak

**Issue:** `update()` does `read → merge → write` as three separate synchronous filesystem calls. When concurrency > 1, two workers completing steps simultaneously both read the same stale JSON, each merges their patch independently, and the slower write silently drops the other's update. This corrupts `currentSteps`, `steps` statuses, and `completedAt` timestamps without any error.

**Fix hint:** Use an in-memory write-through cache (Map keyed by executionId with a dirty flag) so all mutations in the same process go through a single object reference. Flush to disk after each mutation. This eliminates TOCTOU without requiring advisory file locks.

---

### 4. [HIGH] `as any` to access `StepRunner` internals — `WorkerAdapter.ts:54` — Category: hidden-dep

**Issue:** `(this.stepRunner as any).config` reads a private/undocumented internal property of `flow-engine`'s `StepRunner`. If the property is renamed, moved, or lazily initialized in a future version of `flow-engine`, this silently produces `undefined` and the patched runner is created with an empty config — no error, no log, wrong behaviour.

**Fix hint:** Either expose a `getConfig()` accessor in `StepRunner` (preferred — raise the issue upstream), or construct the patched runner directly from the original options object (store the options in `WorkerAdapter`'s constructor instead of reaching into the runner's guts).

---

### 5. [MEDIUM] Workspace allocated with a throwaway `executionId` — `CommandHandler.ts:77–83` — Category: other

**Issue:** `workspaceManager.allocate({ taskId: generateExecutionId(), ... })` generates a fresh random ID that is never stored or linked to the actual `executionId` generated two lines later (line 83). The workspace is allocated under an orphaned ID that cannot be looked up later for cleanup, debugging, or re-use.

**Fix hint:** Generate `executionId` before calling `allocate`, then pass it as `taskId`. Single source of truth for the ID.

---

### 6. [MEDIUM] `loadFlowHooks` silently swallows all config parse errors — `Daemon.ts:25–27` — Category: error-handling

**Issue:** The `catch` block returns `{}` with no log output. A malformed `.flows/config.yml` (bad YAML, wrong hook structure) is indistinguishable from "no hooks configured". Operators have no way to detect misconfiguration without checking the file manually.

**Fix hint:** Write a `process.stderr.write` in the catch block with the config path and error message. Keep the `return {}` fallback to avoid crashing the daemon, but make the failure observable.

---

### 7. [MEDIUM] Cross-batch dependency validation in `injectSteps` fails on valid intra-batch deps — `StepQueue.ts:69–75` — Category: error-handling

**Issue:** When injecting a batch where step B declares `depends: ['A']` and both A and B are new (not yet in `entry.steps`), the validation loop at line 70 calls `entry.steps.has(dep)` before any new steps have been added. This rejects a perfectly valid batch as if the dependency were missing. The two-pass approach (validate then add) is correct in intent but the validation doesn't include the incoming batch.

**Fix hint:** Build a temporary `Set` of new step IDs from `injectedSteps`, then check `entry.steps.has(dep) || newStepIds.has(dep)` in the validation loop.

---

### 8. [MEDIUM] No timeout on step execution — `Worker.ts:41` / `WorkerAdapter.ts:16` — Category: resource-leak

**Issue:** `adapter.execute(...)` (which eventually calls `StepRunner.executeStep`) has no timeout guard in the worker. A step that hangs (hung subprocess, deadlocked MCP server, network stall) occupies a worker slot forever, blocking all subsequent steps on that execution and eventually starving the concurrency pool.

**Fix hint:** Wrap `adapter.execute` with a `Promise.race` against a configurable timeout (e.g. from `FlowConfig`). On timeout, reject with a descriptive error so `step_failed` is emitted and the slot is freed.

---

### 9. [MEDIUM] `CommandHandler` fallback constructor creates hidden `ExecutionStore`/`LogWriter` with wrong `retainDays` — `CommandHandler.ts:26–27` — Category: hidden-dep

**Issue:** `executionStore ?? new ExecutionStore(path.join(daemonDir, 'executions'))` uses the default `retainDays = 30`, ignoring whatever `FlowConfig.logs.retainDays` was configured. Any code path that constructs `CommandHandler` without passing the pre-built instances (e.g. tests, future callers) will silently use a mismatched retention policy. The fallback path is an invisible configuration fork.

**Fix hint:** Remove the optional fallback and make both `executionStore` and `logWriter` required constructor parameters. Any caller that doesn't have them yet should construct them explicitly. This makes the dependency graph visible.

---

### 10. [LOW] HTTP hooks resolve successfully on any HTTP status code — `HookDispatcher.ts:94–95` — Category: error-handling

**Issue:** The response handler (`res.on('end', () => settle(resolve))`) resolves the promise regardless of `res.statusCode`. A webhook endpoint returning 500 or 404 is treated as a successful delivery. Combined with the silent `.catch(() => {})` in `dispatch`, a misconfigured webhook produces no observable signal whatsoever.

**Fix hint:** In the response `end` handler, check `res.statusCode` and reject if `>= 400`. The rejection is still swallowed per D32's ignore policy, but at least it can be logged at the `dispatch` level if logging is ever added there.

---

## Score: 5/10

The architecture is clean (well-defined interfaces, clear separation of IPC/storage/hooks) and the code shows good intent (exhaustive switches, PID validation, connect timeout). However four HIGH-severity issues can cause data corruption or incorrect behaviour in production (duplicate method, mutable shared dispatcher, no file locking, `as any` fragile coupling), and the MEDIUM findings cluster around missing timeouts and validation gaps that will surface under load or adversarial input.
