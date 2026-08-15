# Discoverability Audit V3

Audited: Protocol.ts, CommandHandler.ts, StepQueue.ts, WorkerPool.ts, WorkerAdapter.ts, TaskStore.ts, FlowValidator.ts, RunCommand.ts, ValidateCommand.ts

---

## FIXED since V2

- **H2**: `AssignableStep` no longer includes `subflow` (Protocol.ts:4 — `Extract<FlowStep, { type: 'model' | 'script' }>`). The type now matches the implementation.
- **H3**: (WorkerAdapter misname) — unchanged; tracked below as MED.
- **H4**: (generateExecutionId cross-domain) — unchanged.

---

## HIGH

_(none — H2 fixed, H1/H3/H4/H5 are naming/doc issues, elevated to context below)_

---

## MEDIUM

### M-A — InjectedStep name implies validation it does not provide

**FILE:LINE:** `Protocol.ts:38`

`InjectedStep` has `[key: string]: unknown` and carries the doc comment "Unvalidated wire format." The name "InjectedStep" implies it is ready for injection. A reader of `inject_steps` in Daemon.ts must know to distrust the contents.

**Suggestion:** Rename to `RawInjectedStep` or `UnvalidatedStepPayload`.

---

### M-B — WorkerAdapter orchestrates, does not adapt

**FILE:LINE:** `WorkerAdapter.ts:9`

The class builds a `Workspace` object, converts `stepOutputs` from Record to Map, creates/tears down an `McpServer`, and patches `StepRunner` internals via `any` cast. None of these are adapter-pattern concerns. A reader searching for where model steps are executed will not find it here.

**Suggestion:** Rename to `StepExecutor` or `WorkerStepRunner`.

---

### M-C — `sendToDaemon` hides a daemon auto-start side effect

**FILE:LINE:** `RunCommand.ts:52-68`

The function name implies a simple send. It silently starts the daemon and retries on `DaemonNotRunningError`. The side effect is invisible from the call site.

**Suggestion:** Rename to `sendToDaemonWithAutoStart`, or move the start-and-retry logic to the `action` handler.

---

### M-D — `daemonDir` hardcoded independently in Daemon.ts and RunCommand.ts

**FILE:LINE:** `Daemon.ts:44`, `RunCommand.ts:91`

`path.join(os.homedir(), '.flow-daemon')` appears in two unrelated modules. A path change requires editing both files with no compile-time link.

**Suggestion:** Extract `getDaemonDir()` into `src/paths.ts` and import in both.

---

### M-E — `registerWorker` / `removeWorker` naming asymmetry

**FILE:LINE:** `WorkerPool.ts:71, 88`

`registerWorker` pairs with `removeWorker` — asymmetric prefixes suggest they are not counterparts.

**Suggestion:** Rename `removeWorker` to `deregisterWorker`.

---

### M-F — ValidateResult uses exit codes as type discriminant

**FILE:LINE:** `FlowValidator.ts:17-20`

`{ exit: 0 | 1 | 2 | 3 }` leaks POSIX CLI concerns into the domain type. Non-CLI consumers must map numeric codes.

**Suggestion:** Use semantic discriminants (`'valid' | 'validation_errors' | 'file_not_found' | 'parse_error'`) and map to exit codes in `ValidateCommand.ts` only.

---

### M-G — `MISSING_OUTPUT` and `UNUSED_OUTPUT` mapped to `'input'` category

**FILE:LINE:** `FlowValidator.ts:97-100`

Output-related validation codes are filed under `'input'`. A caller filtering `type === 'output'` finds nothing.

**Suggestion:** Add an `'output'` category and remap the three output codes to it.

---

## LOW

### L1 — `{ type: 'idle' }` dead variant in DaemonToWorker

**FILE:LINE:** `Protocol.ts:28-30`

Never sent in v1. The comment says workers should handle it as a no-op, but does not state this expectation on the type. Worker.ts:51 does handle it (`case 'idle': break`) — consistent but confusing.

**Suggestion:** Add `/** @v2-reserved No-op in v1. Worker must ignore silently. */`.

---

### L2 — `'re-queued'` ExecutionStatus is unreachable in v1

**FILE:LINE:** `Protocol.ts:54`

Comment notes it is reserved for v2. Any exhaustive switch must handle it with a dead branch.

**Suggestion:** Add `/** @v2-reserved Never produced in v1. */`.

---

### L3 — FlowValidator.ts filename conflicts with internal class alias

**FILE:LINE:** `FlowValidator.ts:1-5`

The file exports `validateFlowFile()`, not a class, but must alias the imported engine class as `EngineFlowValidator` to avoid a name collision.

**Status:** Known, deferred. Acceptable v1 deferral.

---

## Score: 6/10

The key protocol type error (AssignableStep including subflow) was fixed. Seven naming/structural issues remain that increase cognitive load but do not cause bugs. Most are rename/extract tasks suitable for the next maintenance pass.
