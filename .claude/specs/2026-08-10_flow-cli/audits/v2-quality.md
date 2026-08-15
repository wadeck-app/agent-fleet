# Quality Audit V2

Audited: CommandHandler.ts, Daemon.ts, StepQueue.ts, WorkerPool.ts, WorkerAdapter.ts, Worker.ts, RunCommand.ts, ValidateCommand.ts, FlowValidator.ts, ExecutionStore.ts

---

## HIGH Severity

### H1 - Correctness bug: injected steps never registered in ExecutionStore

**Files:** Daemon.ts:103-122 + StepQueue.ts:47-94

When a model step injects child steps via inject_steps, those steps are added to StepQueue.entry.steps (in-memory) but NEVER written to ExecutionStore. The step_completed handler at Daemon.ts:110-122 reads state from disk. state.steps only contains original steps from ExecutionStore.create(). If all original steps complete (including the injecting one), allDone becomes true and markExecutionCompleted fires while injected steps are still queued or running. The flow is falsely declared done; injected outputs are silently discarded.

**Why it matters:** Any flow using provideSteps / inject_steps silently truncates execution as soon as the parent step completes. This is the primary dynamic injection use-case.

**Fix:** Either (a) add injected step IDs to ExecutionStore when processing inject_steps, or (b) move the allDone check to StepQueue (authoritative step set) and propagate the signal from there.

---

### H2 - Correctness bug: injectSteps rejects valid same-batch dependencies

**File:** StepQueue.ts:62-94

The validation loop (lines 62-75) checks that every declared dependency exists in entry.steps BEFORE the add loop (lines 79-94) inserts the new steps. If step A depends on step B and both are injected in the same batch, the validator throws "Dependency step B does not exist" even though B is in injectedSteps. The comment on line 78 says "Add all steps first (so cross-references within the batch work after validation)" but the code does the opposite: validation runs first, then add.

**Why it matters:** Same-batch intra-dependencies are the natural way to inject a DAG of child steps. This silently prevents all such calls from succeeding.

**Fix:** Pre-populate a temporary set with all IDs from injectedSteps and check against it during validation, OR move the validation loop after the add loop.

---

### H3 - Resource leak: workspace allocated with a throwaway ID

**File:** CommandHandler.ts:76-83

generateExecutionId() is called twice (lines 76 and 83); the IDs are independent. The workspace is allocated with the first ID (taskId) which is never stored anywhere. The execution is tracked with the second ID (executionId). No code can later call workspaceManager.release(taskId) because taskId is not saved in ExecutionContext, ExecutionState, or any persistent object.

**Why it matters:** Every flow run leaks a workspace allocation. Depending on WorkspaceManager lifecycle semantics (file locks, temp dirs, concurrency keys), this either wastes disk space or exhausts workspace slots over time.

**Fix:** Generate a single ID before allocate and reuse it as both taskId and executionId.

---

## MEDIUM Severity

### M1 - Ordering bug: user_intervention check after ExecutionStore.create()

**File:** CommandHandler.ts:86 → 101-109

The user_intervention guard fires at line 101, but ExecutionStore.create() runs at line 86 and workspace allocation runs at lines 76-81. When a flow contains a user_intervention step, both the workspace and the store entry are already created before the function returns the error. The workspace leak is already reported as H3, but the store entry orphan is a separate issue: a 'queued' record is written that never transitions to 'completed' or 'failed' and will persist until pruneOldExecutions prunes it after retainDays.

**Why it matters:** Orphaned records inflate the executions directory and corrupt `flow-cli status` output for that execution ID.

**Fix:** Move the user_intervention check immediately after validation (before workspace allocation and before ExecutionStore.create()).

---

### M2 - Duplicate validation logic between CommandHandler and FlowValidator

**Files:** CommandHandler.ts:61-68 and FlowValidator.ts:55-63

Both files independently instantiate `FlowValidator` (the engine class) and call `.validate()`, and both filter issues by `i.severity === 'error'`. If the daemon's error policy diverges from the CLI validate policy (e.g., promoting a warning to error), only one site gets updated. The validator options argument is `undefined` in both places.

**Why it matters:** Silent policy divergence: flows rejected by `flow-cli validate` could be accepted by the daemon (or vice versa) after a one-sided change.

**Fix:** CommandHandler should reuse `validateFlowFile()` from FlowValidator.ts, or extract a shared `validateFlow(flow: FlowDefinition): ValidateResult` helper called by both.

---

### M3 - HookDispatcher race: overwritten on concurrent run commands

**File:** Daemon.ts:61-62

`commandHandler.setHookDispatcher(new HookDispatcher(flowHooks))` is called inside the `run` command handler. HookDispatcher is stored as a single field on CommandHandler. If two `run` commands arrive before either flow finishes, the second call overwrites the dispatcher. Steps from execution A will fire hooks loaded from execution B's `.flows/config.yml`.

**Why it matters:** In concurrent execution (concurrency > 1), hooks are misdirected: onStepStart/onStepEnd from flow A fire the handlers of flow B, and flow A's handlers are never invoked.

**Fix:** Bind the HookDispatcher to the execution context at enqueue time and pass it per-step dispatch rather than storing it as a mutable global on CommandHandler. Alternatively, resolve hooks once per execution and store them in ExecutionContext.

---

### M4 - subflow steps enqueued then rejected at execution time

**Files:** CommandHandler.ts:111-113 and WorkerAdapter.ts:21

CommandHandler explicitly includes `s.type === 'subflow'` in the AssignableStep filter (line 113), so subflow steps are enqueued to StepQueue and dispatched to workers. WorkerAdapter.execute() immediately throws `Step type 'subflow' is not supported in v1` (line 21). The step fails, which marks the entire execution failed. The unsupported type check is in the wrong layer.

**Why it matters:** A flow containing subflow steps appears to start (executionId returned) but silently fails when the subflow step is dispatched, rather than being rejected upfront with a clear UNSUPPORTED_STEP_TYPE error. There is already a pattern for this check (user_intervention at line 102-109) that is not applied to subflow.

**Fix:** Add `s.type !== 'subflow'` to the CommandHandler filter, or add an explicit pre-flight check mirroring the user_intervention guard.

---

### M5 - Dead code in StepQueue.onStepCompleted: unreachable failedSteps branch

**File:** StepQueue.ts:123-130

The allDone check on line 123 tests `entry.failedSteps.has(sid)` to handle the case where some steps failed. However, `onStepFailed` at lines 135-150 immediately calls `this.executions.delete(executionId)` before returning. Any subsequent `onStepCompleted` call for the same execution finds `entry === undefined` at line 110 and returns early. The branch where `allDone` is true because of failed steps inside `onStepCompleted` can never be reached.

**Why it matters:** The dead branch creates a misleading impression that onStepCompleted handles mixed completed/failed terminal states, and it obscures the real shutdown path (which only goes through Daemon.ts:step_completed handler checking ExecutionStore).

**Fix:** Remove `|| entry.failedSteps.has(sid)` from the allDone predicate to reflect the actual invariant: if this code path is reached, only completedSteps can make allDone true.

---

## LOW Severity

### L1 - pruneOldExecutions uses file mtime instead of completedAt

**File:** ExecutionStore.ts:26-37

The pruning decision uses `stat.mtimeMs` (filesystem modification time). Any external process that touches the file — backup tool, antivirus scan, monitoring agent, especially on Windows — resets mtime and prevents the record from being pruned. The completedAt timestamp is already stored inside the JSON.

**Fix:** Parse the JSON and compare `state.completedAt ?? state.startedAt` against the cutoff. Fall back to mtime only if JSON parse fails.

---

### L2 - iterations counter is premature/dead code in v1

**File:** ExecutionStore.ts:75-79

`markStepRunning` increments `step.iterations` via `(state.steps[stepId]?.iterations ?? 0) + 1`. No retry mechanism exists in v1: `onStepFailed` immediately removes the execution from StepQueue without re-queuing. The iterations counter is always 1 for every step.

**Fix:** Remove the iterations field until a retry mechanism is implemented, to avoid maintaining misleading state.

---

### L3 - loadFlowHooks silently swallows YAML parse errors

**File:** Daemon.ts:21-27

The catch block at line 25 returns `{}` without logging. A misconfigured `.flows/config.yml` is silently dropped — all hooks are disabled with no visible signal. Users debugging missing hook callbacks will find no error to trace.

**Fix:** Write a warning to stderr (or the logWriter) before returning `{}` so the silent failure is visible.

---

### L4 - McpServer: new StepRunner constructed per-step via `any` cast

**File:** WorkerAdapter.ts:54-61

For every model step, a new `StepRunner` is created by reading `(this.stepRunner as any).config`. The `any` cast is fragile: if StepRunner's internal config field is renamed or restructured, this silently reads `undefined` and the spread produces a broken config. Additionally, if StepRunner construction is expensive (connections, file I/O), the cost is paid once per step.

**Fix:** Expose a `withEnv(extra: Record<string, string>): StepRunner` factory method on StepRunner, or accept a runner factory function in WorkerAdapter's constructor, eliminating the `any` cast.

---

### L5 - waitForCompletion constructs a third ExecutionStore instance

**File:** RunCommand.ts:28

`new ExecutionStore(path.join(daemonDir, 'executions'))` creates a standalone read-only store in the CLI process. The Daemon already owns two instances (one in startDaemon, one passed to CommandHandler). Since ExecutionStore has no in-memory cache this is correct, but it means the same file is opened and parsed by three independent objects. For polling, the construction overhead is trivial, but the pattern makes the ownership model harder to reason about.

**Fix:** Low priority. Consider a read-only `ExecutionReader` type that wraps just `read()` and `pruneOldExecutions()`, making the cross-process read intent explicit.

---

### L6 - File-naming mismatch documents a convention violation instead of fixing it

**File:** FlowValidator.ts:1-3

The comment acknowledges the file exports a function (`validateFlowFile`) but is named after a class (`FlowValidator`). Per the project's CLAUDE.md naming convention, PascalCase file names must match the exported class. The comment defers the fix to "a future refactor" rather than tracking it as a task.

**Fix:** Either rename the file to `validateFlowFile.ts` (camelCase, function-export convention) or convert the export to a class `FlowValidator` wrapping `validateFlowFile`. Remove the comment once resolved.

---

### L7 - McpServer: body reader uses String(chunk) instead of explicit encoding

**File:** McpServer.ts:277

`String(chunk)` on a Node.js Buffer invokes `Buffer.prototype.toString()` with no encoding argument, which defaults to UTF-8 in current Node versions. This is functionally equivalent to `chunk.toString('utf8')` today, but `String(chunk)` bypasses the Buffer API and relies on implicit coercion. Future Node versions or environments with non-UTF-8 defaults could produce garbage.

**Fix:** Replace `String(chunk)` with `(chunk as Buffer).toString('utf8')` for explicit intent.

---

## Score: 5/10
