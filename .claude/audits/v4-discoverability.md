# Discoverability Audit V4

Audited: Protocol.ts, CommandHandler.ts, StepQueue.ts, WorkerPool.ts, WorkerAdapter.ts, TaskStore.ts, FlowValidator.ts, RunCommand.ts, ValidateCommand.ts

---

## Fixed since V3

- **M-E registerWorker/removeWorker asymmetry**: Still present — not fixed. Deferred.
- No new fixes in this iteration for discoverability.

## New observations

### CommandHandler.dispatchHook signature change

`dispatchHook(executionId, event, payload)` — new first parameter makes call sites clearer (callers now explicitly pass the execution scope). Positive change from this iteration.

### removeExecutionHooks is a new public method

`CommandHandler.removeExecutionHooks(executionId)` is called in Daemon.ts at execution completion/failure. Naming is clear and the method's purpose is obvious. No issues.

## Remaining issues (unchanged from V3)

- **M-A** InjectedStep name implies validation — deferred
- **M-B** WorkerAdapter misname — deferred
- **M-C** sendToDaemon hidden side effect — deferred
- **M-D** daemonDir hardcoded in two files — deferred
- **M-E** registerWorker/removeWorker asymmetry — deferred
- **M-F** ValidateResult numeric exit codes in domain type — deferred
- **M-G** MISSING_OUTPUT mapped to 'input' category — deferred
- **L1–L3** Dead type variants, FlowValidator naming — deferred

## Score: 6/10

No new discoverability regressions. Existing MED findings unchanged; all are rename/restructure tasks for a v2 maintenance pass.
