# Quality Audit V3

Audited: CommandHandler.ts, Daemon.ts, StepQueue.ts, WorkerPool.ts, WorkerAdapter.ts, Worker.ts, RunCommand.ts, ValidateCommand.ts, FlowValidator.ts, ExecutionStore.ts

---

## FIXED since V2

- **H1**: Injected steps are now registered in ExecutionStore (Daemon.ts:161-166). The allDone check reads from ExecutionStore so it now sees injected steps. Correct.
- **H2**: Same-batch intra-dependencies: StepQueue.ts:63 builds `allKnownIds` combining existing + batch IDs before validating. Fixed.
- **H3**: Single `executionId` generated before `allocate()` (CommandHandler.ts:96). TaskId and executionId are now the same value.
- **M1**: user_intervention check moved before workspace allocation (CommandHandler.ts:72-79).
- **M4**: Subflow steps rejected upfront in CommandHandler (lines 82-89) before any allocation.
- **M5**: Dead `failedSteps.has(sid)` branch removed; comment at StepQueue.ts:126-127 explains why.
- **L1**: `pruneOldExecutions` reads `completedAt`/`startedAt` from JSON instead of file mtime.
- **L3**: `loadFlowHooks` now logs to stderr instead of silently returning `{}`.

---

## MEDIUM

### M2 — Duplicate validation logic between CommandHandler and FlowValidator CLI

**Files:** `CommandHandler.ts:61-68`, `FlowValidator.ts:55-63`

Both independently instantiate `FlowValidator(undefined)` and filter `severity === 'error'` issues. A change to the error-threshold policy in one site will silently diverge from the other. CommandHandler should call `validateFlowFile()` from `FlowValidator.ts` (which already encapsulates this logic), or both should delegate to a shared `validateFlow(flow): ValidationResult` helper.

---

### M3 — HookDispatcher race: per-run mutation of shared mutable field

**File:** `Daemon.ts:63`, `CommandHandler.ts:22, 30`

`commandHandler.setHookDispatcher(new HookDispatcher(flowHooks))` is called inside the `run` command handler. With concurrency > 1, a second `run` command overwrites the dispatcher while the first execution's hooks are still firing. Steps from execution A invoke callbacks from execution B's config.

**Fix:** Pass the resolved `HookDispatcher` as a parameter to `commandHandler.handleRun(cmd, dispatcher)` instead of storing it as a mutable field. CommandHandler becomes stateless with respect to hook config.

---

### M4 — StepRunner private config accessed via `any` cast

**File:** `WorkerAdapter.ts:54`

`(this.stepRunner as any).config` bypasses TypeScript's type system to access a private field. If `flow-engine` renames the field, the failure is invisible at compile time and crashes at runtime. This has been noted in V2 and V1 without a fix.

**Status:** Blocked on `flow-engine` exposing a `withEnv()` factory. Add a runtime guard: `if (!originalConfig) throw new Error('StepRunner.config not accessible — flow-engine version mismatch')`.

---

## LOW

### L4 — `iterations` field: dead state in ExecutionStore

**File:** Not found in current ExecutionStore.ts — field was removed. Verified: `markStepRunning` no longer increments `iterations`. Fixed as a side effect of refactoring.

### L6 — FlowValidator.ts naming comment defers the fix indefinitely

**File:** `FlowValidator.ts:1-3`

The file-top comment acknowledges the naming convention violation but defers it. Per project rules, PascalCase file names must match the exported class. The comment is not a fix.

**Status:** Acceptable v1 deferral if tracked. No action needed this iteration.

---

## Score: 7/10

Three V2 HIGH correctness bugs fixed. Remaining issues are MED: duplicate validation logic (policy divergence risk), HookDispatcher concurrency race (silent wrong-hooks under load), and a blocked fix for the StepRunner `any` cast.
