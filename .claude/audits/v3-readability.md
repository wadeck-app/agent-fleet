# Readability Audit V3

Files reviewed: FlowIndex.ts, RunCommand.ts, ShowCommand.ts, CommandHandler.ts, StepQueue.ts, WorkerAdapter.ts, FlowValidator.ts

---

## FIXED since V2

- **#4**: `user_intervention` check now runs before workspace allocation. Fixed.
- FlowValidator.ts uses `throw new Error(...)` in the `default` branch of `validationCodeToType` — fail-fast correct.

---

## HIGH — Violates project "fail fast / no silent suppression" standard

### 1. Silent `return` in StepQueue when entry missing

**File:** `StepQueue.ts:114`, `StepQueue.ts:141`, `StepQueue.ts:158`

```ts
const entry = this.executions.get(executionId);
if (!entry) return;  // onStepCompleted, onStepFailed
if (entry) entry.activeSteps.add(stepId);  // markStepActive (conditional no-op)
```

A missing entry means a message arrived for an unknown or already-deleted execution. This can indicate a bug (stale IDs, double-send) or a late message after the execution was purged by `onStepFailed`. Neither case should be completely silent.

For `onStepCompleted` and `onStepFailed`, the silent return after execution deletion by a prior `onStepFailed` is a valid code path (race between two workers on the same failed execution). The correct response is a logged warning, not a throw, since the late message is not a programming error.

For `markStepActive`, the conditional no-op hides cases where `dequeue()` returned a step for a non-existent execution — that would be a programming error.

**Fix:**
- `onStepCompleted`/`onStepFailed`: `if (!entry) { process.stderr.write(...); return; }`
- `markStepActive`: throw if entry is missing, since callers should only call this after a successful `dequeue()`.

---

### 2. Bare `catch {}` swallows all errors in --wait polling loop

**File:** `RunCommand.ts:35`

```ts
try {
    const state = store.read(executionId);
    if (state.status === 'completed' || state.status === 'failed') return state;
} catch { /* not ready yet */ }
```

The comment claims this handles "not ready yet," but `store.read()` throws on JSON parse errors, permission errors, and disk-full conditions — not just missing files. All real errors are silently retried until timeout.

**Fix:** Add an `exists(executionId: string): boolean` method to `ExecutionStore` that checks file existence without parsing. Use it to distinguish "not yet written" from actual errors:
```ts
if (!store.exists(executionId)) { await new Promise(r => setTimeout(r, delay)); continue; }
const state = store.read(executionId);
```

---

### 3. `trace.outputs ?? {}` silent fallback returns empty object

**File:** `WorkerAdapter.ts:65`, `WorkerAdapter.ts:72`

```ts
return (trace.outputs ?? {}) as Record<string, unknown>;
```

If `trace.outputs` is `undefined`, the step returns an empty output map with no diagnostic. Downstream steps that depend on these outputs will silently receive nothing, producing wrong results that are hard to trace.

The correct behavior depends on whether `trace.outputs === undefined` is a legitimate result from `flow-engine` (e.g. for script steps with no captured output). If it is legitimate, a comment explaining that fact is needed. If it is not legitimate, throw.

**Fix:** Add a comment confirming this is legitimate (or throw with a clear message):
```ts
// trace.outputs is undefined for steps with no output capture — empty map is correct
return (trace.outputs ?? {}) as Record<string, unknown>;
```
Or if it should never be undefined:
```ts
if (trace.outputs === undefined) throw new Error(`Step ${step.id} produced no output trace`);
return trace.outputs as Record<string, unknown>;
```

---

## MEDIUM

### 4. Repeated `options.json && !options.human` guard

**File:** `RunCommand.ts:138, 149, 164, 173`

The condition appears 4 times. A reader must verify each occurrence to confirm they are identical.

**Fix:** `const machineReadable = options.json && !options.human;` at the top of the action handler.

---

### 5. 106-line inline action callback

**File:** `RunCommand.ts:82-187`

The callback handles input parsing, path resolution, config loading, IPC send, --wait polling, and output formatting. Untestable as a unit; the structure buries the main flow.

**Fix:** Extract `async function runFlow(flowRef: string, options: RunOptions): Promise<void>` and call from `.action`. This also allows the `machineReadable` variable to be extracted once.

---

### 6. Double `as any` cast to access StepRunner private field

**File:** `WorkerAdapter.ts:54`

```ts
const originalConfig = (this.stepRunner as any).config as any;
```

Two layers of type erasure. If `StepRunner` renames `config`, this fails silently at runtime.

**Status:** Blocked on `flow-engine` API change. Add runtime guard per Maintenance M3.

---

### 7. `new FlowValidator(undefined)` — explicit undefined argument

**File:** `CommandHandler.ts:61`, `FlowValidator.ts:55`

Passing `undefined` explicitly suggests the parameter is required but intentionally left empty. If the parameter is optional, omit it. If it is required and `undefined` has a specific meaning, document it.

**Fix:** Change to `new FlowValidator()` (if optional) in both sites.

---

## LOW

### 8. `import * as fs from 'fs'` in loadYaml.ts missing `node:` prefix

**File:** `loadYaml.ts:1`

All other files use `node:fs`. Inconsistency creates unnecessary cognitive friction.

**Fix:** `import * as fs from 'node:fs';`

---

### 9. ValidateCommand --json case 0: exits with no output

**File:** `ValidateCommand.ts:16`

`case 0: process.exit(0)` produces no stdout in JSON mode. A caller consuming `--json` cannot distinguish success from a killed process.

**Fix:** `process.stdout.write(JSON.stringify({ valid: true }) + '\n'); process.exit(0);`

---

### 10. `--json` and `--human` mutual exclusion not enforced

**File:** `RunCommand.ts:80-81`, `ValidateCommand.ts:8-9`

Both flags can be passed simultaneously; the effective behavior (--human wins) is implicit.

**Fix:** Add `.conflicts('human')` to the `--json` option definition in Commander.

---

## Score: 6/10

Two critical "fail-fast" violations fixed (user_intervention pre-check). Four HIGH and MEDIUM violations remain: silent polling catch, silent step-active no-op, repeated condition, and oversized action callback. The silent `trace.outputs ?? {}` is unclear without knowing flow-engine's contract — needs a comment or a throw.
