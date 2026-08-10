# Plan Consistency Audit — Wave 2 (2026-08-10)

## Findings

### F1 — D22: `pruneOldExecutions()` never called (Fixed)
**File:** `src/daemon/Daemon.ts`
**Problem:** Method implemented and tested but never invoked → execution files never expire.
**Fix:** Called `executionStore.pruneOldExecutions()` inside `onStart` hook.

### F2 — D25: multi-shot output extraction retry absent (Documented deferred v2)
**File:** `src/worker/StepExecutor.ts`
**Problem:** D25 requires retry loop with `--resume <sessionId>` on `OutputExtractionError`. Not implemented.
**Comment added:** `// D25: multi-shot retry not implemented in v1. OutputExtractionError propagates as step_failed.`

### F3 — D31: LogMasker not wired (Documented in threat-model — wave 1)
Already documented in threat-model.md as "Known limitations (v1)".

### F4 — D31: `step.env` not template-rendered (Documented deferred v2)
**File:** `src/worker/StepExecutor.ts`
**Problem:** Script env values with `${{ secrets.name }}` passed as literal strings. Model steps receive `env: {}` entirely.
**Comment added:** `// D31: step.env values not template-rendered/secret-resolved in v1. Tracked for v2.`

### F5 — D37/D32: flow lifecycle hooks never loaded (Fixed)
**File:** `src/daemon/Daemon.ts`
**Problem:** `HookDispatcher({})` always empty — `onFlowStart`, `onStepStart`, etc. were no-ops.
**Fix:** Added `loadFlowHooks(cmd.cwd)` helper reading `.flows/config.yml` top-level `hooks:` key. Called per `run` command to inject fresh dispatcher.

### F6 — D30: `when:` field not evaluated (Documented deferred v2)
**File:** `src/daemon/StepQueue.ts` `enqueueReady()`
**Problem:** Steps enqueued solely on `depends` satisfied, ignoring `when:` guard expressions.
**Comment added:** `// D30: when: conditions not evaluated in v1. ConditionEvaluator tracked for v2.`
