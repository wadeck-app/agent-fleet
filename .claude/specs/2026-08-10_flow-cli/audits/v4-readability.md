# Readability Audit V4

Files reviewed: FlowIndex.ts, RunCommand.ts, ShowCommand.ts, CommandHandler.ts, StepQueue.ts, WorkerAdapter.ts, FlowValidator.ts

---

## Fixed since V3

- **#1 StepQueue silent returns**: `onStepCompleted`/`onStepFailed` now log to stderr on missing entry. `markStepActive` throws on missing entry.
- **#2 Bare catch in RunCommand polling loop**: Replaced with `store.exists(executionId)` check. Real I/O errors now propagate instead of being swallowed.
- **#3 trace.outputs ?? {} silent fallback**: Clarifying comments added for both model and script step cases.
- **#9 ValidateCommand JSON case 0 no output**: Now emits `{ "valid": true }` to stdout.

## Remaining

### MED #4 — Repeated `options.json && !options.human` guard

**File:** `RunCommand.ts:138, 149, 164, 173`

Four identical expressions. Still present. Deferred.

### MED #5 — 106-line inline action callback

**File:** `RunCommand.ts:82-188`

Still untestable in isolation. Deferred.

### MED #6 — `as any` double cast in WorkerAdapter

**File:** `WorkerAdapter.ts:54`

Still present. Blocked on flow-engine.

### MED #7 — `new FlowValidator(undefined)` explicit undefined

**File:** `CommandHandler.ts:59`, `FlowValidator.ts:55`

`undefined` passed to optional parameter. Should be omitted.

### LOW #8 — loadYaml.ts missing `node:` prefix

**File:** `loadYaml.ts:1`

Inconsistent with rest of codebase. Trivial fix.

### LOW #10 — `--json`/`--human` mutual exclusion not enforced

**File:** `RunCommand.ts:80-81`, `ValidateCommand.ts:8-9`

Both flags can be passed simultaneously. Deferred.

## Score: 8/10

Three HIGH readability violations fixed (silent swallow in polling, StepQueue hidden bugs, outputs comment). Remaining items are MED/LOW style issues with no correctness impact.
