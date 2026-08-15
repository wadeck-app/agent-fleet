# Discoverability Audit V2

**Scope:** `ipc/Protocol.ts`, `daemon/StepQueue.ts`, `daemon/WorkerPool.ts`, `worker/WorkerAdapter.ts`, `worker/McpServer.ts`, `task/TaskStore.ts`, `validation/FlowValidator.ts`, `cli/commands/RunCommand.ts`, `cli/commands/ValidateCommand.ts`

---

## HIGH

### H1 — InjectedStep name implies validated form; it is explicitly unvalidated
**FILE:LINE:** `src/ipc/Protocol.ts:37-43`

`InjectedStep` carries the doc-comment "Unvalidated wire format" and has `[key: string]: unknown`, yet its name suggests it is a fully-formed step ready for injection. `WorkerToDaemon` at line 50 uses it as `steps: InjectedStep[]`, further reinforcing the false impression that these steps are safe to use. Code reading `inject_steps` handling in `Daemon.ts:156-164` must know to distrust the contents.

**Suggestion:** Rename to `RawInjectedStep` or `UnvalidatedStepPayload` to make the unvalidated state visible at every call site.

---

### H2 — AssignableStep includes `subflow` but both CommandHandler and WorkerAdapter reject it
**FILE:LINE:** `src/ipc/Protocol.ts:3`

`AssignableStep = Extract<FlowStep, { type: 'model' | 'script' | 'subflow' }>` promises that subflow steps are assignable. `CommandHandler.ts:112` filters only `model | script | subflow` into the queue, and `WorkerAdapter.ts:21-23` throws `"Step type 'subflow' is not supported in v1"` at runtime. The type system advertises support that the implementation does not provide.

**Suggestion:** Remove `subflow` from the `AssignableStep` union until v2 support is implemented, or introduce a `SupportedAssignableStep = Extract<AssignableStep, { type: 'model' | 'script' }>` for the dispatcher path with a comment marking `subflow` as reserved.

---

### H3 — WorkerAdapter is misnamed; it orchestrates, not adapts
**FILE:LINE:** `src/worker/WorkerAdapter.ts:9`

`WorkerAdapter` is named as an Adapter-pattern class (bridging one interface to another), but it: constructs a full `Workspace` object (workspace management concern), converts `stepOutputs` from `Record` to `Map` (data transformation concern), creates and manages the lifecycle of a `McpServer` (lifecycle management concern), and patches `StepRunner` internals via `any` cast (integration concern). A reader looking for where model steps are executed will search for a class named something like `StepExecutor` or `ModelStepRunner`, not `WorkerAdapter`.

**Suggestion:** Rename to `StepExecutor` or `WorkerStepRunner`. If the adapter pattern is still intended, document precisely which two interfaces are being adapted.

---

### H4 — generateExecutionId() used to generate task IDs — misleading cross-domain reuse
**FILE:LINE:** `src/task/TaskStore.ts:6, 38`

`TaskStore.create()` calls `generateExecutionId()` imported from `ExecutionStore` to mint task IDs. A reader searching for how task IDs are generated finds only `ExecutionStore.ts`. There is no documented guarantee that task IDs and execution IDs are disjoint — an accidental cross-reference lookup (`executionStore.read(taskId)`) would fail with a confusing "Invalid executionId format" or "Corrupted execution state" error rather than a "wrong domain" error.

**Suggestion:** Extract a shared `generateId()` utility (e.g. `src/utils/id.ts`) and import it in both stores. Rename the `ExecutionStore` export to `generateExecutionId` (already done) but rename the shared function to `generateId` and document whether the two namespaces are guaranteed disjoint.

---

### H5 — FlowCommands in RunCommand loses the IPC type contract
**FILE:LINE:** `src/cli/commands/RunCommand.ts:12`

`type FlowCommands = { run: (payload: unknown) => Promise<DaemonResponse> }` types the payload as `unknown`. At line 63 the argument is correctly typed as `ClientCommand`, but the `FlowCommands` interface that governs what the client sends erases it. Any future refactor of `ClientCommand.run` fields produces no compile error at the client boundary.

**Suggestion:** Replace `unknown` with `Extract<ClientCommand, { type: 'run' }>` to make the IPC contract explicit and compiler-checked.

---

## MEDIUM

### M1 — Dead `{ type: 'idle' }` member in DaemonToWorker
**FILE:LINE:** `src/ipc/Protocol.ts:28-29`

`{ type: 'idle' }` is documented as "never sent by the daemon in v1." A new Worker implementation must write a no-op branch for a message that never arrives, and any exhaustive switch must handle a dead variant. The expected worker behavior (no-op) is not documented in the type comment.

**Suggestion:** Remove the variant and reintroduce it in v2 when actually sent. If it must stay for forward compat, add `/** @v2-reserved No-op in v1. Worker should ignore. */`.

---

### M2 — ExecutionStatus contains unreachable `'re-queued'` value
**FILE:LINE:** `src/ipc/Protocol.ts:52-53`

`'re-queued'` is documented "Unreachable in v1 but kept for backward compat." Any exhaustive switch on `ExecutionStatus` (e.g. in a UI renderer or status filter) must handle a value that can never appear in practice, adding dead branches or causing TypeScript exhaustiveness errors that force developers to add a meaningless case.

**Suggestion:** Remove the value and reintroduce it in v2. If it must remain, annotate `/** @v2-reserved Never produced in v1. */` and document the expected switch branch pattern.

---

### M3 — stepOutputs changes representation between wire and worker silently
**FILE:LINE:** `src/ipc/Protocol.ts:8` and `src/worker/WorkerAdapter.ts:40`

`ExecutionContext.stepOutputs` is typed as `Record<string, Record<string, unknown>>` on the wire. `WorkerAdapter` silently converts it to `Map<string, ...>` before passing to `TemplateContext`. A developer extending `WorkerAdapter` or writing a test for `TemplateContext` inputs will see a `Record` in the type and be confused when the runtime value is a `Map`.

**Suggestion:** Add a JSDoc comment on `ExecutionContext.stepOutputs`: `/** Serialized as plain object on the wire; must be converted to Map<string, ...> before passing to TemplateContext. */`

---

### M4 — registerWorker / removeWorker naming asymmetry
**FILE:LINE:** `src/daemon/WorkerPool.ts:71, 88`

`registerWorker(ws, pid)` pairs with `removeWorker(ws)`. The asymmetry (`register` vs `remove`) suggests they are not counterparts, yet they are. Additionally, `markBusy` and `markIdle` are public methods requiring callers to manage state transitions that logically belong to `WorkerPool`'s own state machine.

**Suggestion:** Rename `removeWorker` to `deregisterWorker` for symmetry. Consider exposing `onStepDispatched(ws)` and `onStepResult(ws)` rather than the raw `markBusy`/`markIdle` to encapsulate the state machine inside the pool.

---

### M5 — WorkerPool two-phase lifecycle (spawned vs connected) is undocumented
**FILE:LINE:** `src/daemon/WorkerPool.ts:18-20`

`activeCount` counts spawned child processes; `workers` counts registered WebSocket connections. Between spawn and WebSocket registration, `activeCount > workers.size`. `canSpawn()` uses `activeCount` while `getIdleWorker()` uses `workers`. A caller reasoning about pool capacity must understand both phases and which state variable covers which phase — but this is not documented anywhere.

**Suggestion:** Add a class-level JSDoc block explaining the two-phase lifecycle (spawned → connected) and which field tracks which phase.

---

### M6 — StepQueue.markStepActive is a manual external responsibility
**FILE:LINE:** `src/daemon/StepQueue.ts:152` and `src/daemon/CommandHandler.ts:133`

`enqueueExecution` and `enqueueReady` manage step lifecycle automatically. But after `dequeue()`, the caller (`CommandHandler.tryDispatch`) must manually call `markStepActive` or the same step can be re-enqueued by the next `enqueueReady`. This is an undocumented precondition invisible from `dequeue()`'s signature.

**Suggestion:** Move `activeSteps.add(stepId)` into `dequeue()` so the transition is automatic. Remove the public `markStepActive` method.

---

### M7 — ValidateResult uses exit codes as type discriminant — I/O concern in domain type
**FILE:LINE:** `src/validation/FlowValidator.ts:17-20`

`ValidateResult` discriminates on `exit: 0 | 1 | 2 | 3`. Non-CLI consumers (unit tests, programmatic callers) must map numeric codes to understand what happened. Numeric exit codes are a POSIX CLI concern that has leaked into the validation domain type.

**Suggestion:** Replace with a semantic discriminant (`'valid' | 'validation_errors' | 'file_not_found' | 'parse_error'`) and map to exit codes exclusively in `ValidateCommand.ts`.

---

### M8 — MISSING_OUTPUT and UNUSED_OUTPUT mapped to `'input'` category
**FILE:LINE:** `src/validation/FlowValidator.ts:97-100`

`MISSING_OUTPUT`, `UNUSED_OUTPUT`, and `UNDEFINED_OUTPUT` are categorised as `'input'`. A caller filtering `type === 'output'` finds nothing; a caller filtering `type === 'input'` receives spurious output errors. The mismatch silently breaks programmatic consumers.

**Suggestion:** Add an `'output'` category and map all output-related validation codes to it.

---

### M9 — sendToDaemon silently auto-starts the daemon — hidden side effect
**FILE:LINE:** `src/cli/commands/RunCommand.ts:52-68`

The function name implies it only sends. On `DaemonNotRunningError` it starts the daemon and retries. The side effect is invisible from the call site at line 132 (`response = await sendToDaemon(cmd, config, daemonDir)`).

**Suggestion:** Rename to `sendToDaemonWithAutoStart`, or move the start-and-retry logic into the `action` handler so `sendToDaemon` does exactly one thing.

---

### M10 — daemonDir hardcoded in both Daemon.ts and RunCommand.ts
**FILE:LINE:** `src/daemon/Daemon.ts:43` and `src/cli/commands/RunCommand.ts:91`

`path.join(os.homedir(), '.flow-daemon')` appears in both files independently. A change to the daemon directory requires edits in two unrelated modules with no compile-time link.

**Suggestion:** Extract `DAEMON_DIR` (or `getDaemonDir()`) into `src/paths.ts` (or a similar constants file) and import it in both locations.

---

### M11 — ALLOWED_STEP_FIELDS in McpServer is undocumented coupling to Protocol types
**FILE:LINE:** `src/worker/McpServer.ts:50-54`

`ALLOWED_STEP_FIELDS` is a hardcoded `Set<string>` of field names that must mirror the union of all valid fields across `AssignableStep` subtypes. When new fields are added to step types in `Protocol.ts` or `flow-engine`, this set must be updated manually with no type-level enforcement.

**Suggestion:** Derive the set from the schema definition (e.g. `Object.keys(PROVIDE_STEPS_TOOL.inputSchema.properties.steps.items.properties)`) or add a build-time test that asserts `ALLOWED_STEP_FIELDS` matches the known step field names.

---

### M12 — McpServer name does not communicate per-execution lifecycle
**FILE:LINE:** `src/worker/McpServer.ts:56`

`McpServer` is named as a generic server, but it is instantiated per model step, lives for the duration of one step execution, and is destroyed in the `finally` block of `WorkerAdapter.execute()`. A reader seeing `McpServer` will expect a long-lived shared service.

**Suggestion:** Rename to `StepMcpServer` or `EphemeralMcpServer` to communicate the transient lifecycle.

---

## LOW

### L1 — FlowValidator.ts filename conflicts with the FlowValidator class imported within it
**FILE:LINE:** `src/validation/FlowValidator.ts:1-5`

The file exports `validateFlowFile()`, not a class, but is named `FlowValidator.ts`. Internally it aliases the engine import as `EngineFlowValidator` to avoid the name collision. The file-level comment acknowledges the issue but defers the fix.

**Suggestion:** Rename to `FlowFileValidator.ts` (matching the export function's noun) or `validateFlowFile.ts`.

---

### L2 — TaskRecord.description is frozen as a copy of title with no update path
**FILE:LINE:** `src/task/TaskStore.ts:42, 67`

`create()` sets `description: title`. `updateStatus()` is the only mutation method and ignores description entirely. The field is permanently identical to title for all records, making it misleading — it implies richer content that is never written.

**Suggestion:** Either add a `description` parameter to `create()`, or remove the field until it is actually used.

---

### L3 — Human-readable mode collapses exit codes 2 and 3 to exit 1 — undocumented
**FILE:LINE:** `src/cli/commands/ValidateCommand.ts:33-41`

Both `result.exit === 2` (file not found) and `result.exit === 3` (YAML parse error) exit with code 1 in human-readable mode. The distinction available in `--json` mode is silently lost. This is not documented in the command description or help text.

**Suggestion:** Either propagate exit codes consistently across both modes, or add a note in the command `.description()`: "Use --json for full exit-code distinction (0/1/2/3)."

---

### L4 — `--json` and `--human` mutual exclusion not enforced by Commander
**FILE:LINE:** `src/cli/commands/RunCommand.ts:82` and `src/cli/commands/ValidateCommand.ts:13`

Both flags can be passed simultaneously. The effective precedence rule (`--human` overrides `--json`) is implicit in the `options.json && !options.human` conditionals scattered across both action handlers.

**Suggestion:** Add `.conflicts('human')` to the `--json` option definition, or add an explicit validation at the top of each `action` handler.

---

### L5 — StepState.iterations is undocumented
**FILE:LINE:** `src/ipc/Protocol.ts:60`

`iterations?: number` has no JSDoc or comment. No component in the audited code paths assigns this field (it is set in `ExecutionStore.markStepRunning` as `(state.steps[stepId]?.iterations ?? 0) + 1`). Without a comment, a reader cannot determine what it counts (retries? loop iterations?), when it is populated, or whether it maps to a UI concept.

**Suggestion:** Add `/** Number of times this step has been dispatched to a worker. Incremented each time markStepRunning is called. */`

---

## Score: 4/10

Five HIGH findings centre on misleading names and broken type contracts: an `InjectedStep` that signals validation it does not provide, an `AssignableStep` union that includes `subflow` support that is rejected at runtime, a `WorkerAdapter` name that hides the actual orchestration role of the class, a cross-domain ID generator import with no namespace isolation, and an IPC boundary that loses its type by typing the payload as `unknown`. Seven MEDIUM findings share a common pattern: public state-mutation methods (`markBusy`, `markIdle`, `markStepActive`) that callers must invoke manually in the correct sequence — responsibilities that logically belong inside the owning class's state machine. The codebase is functionally correct in the happy path, but nearly every subsystem has an undocumented precondition or a type that overpromises what the implementation delivers.
