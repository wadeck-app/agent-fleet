# Readability Audit V2

Files reviewed: `FlowIndex.ts`, `TaskIndex.ts`, `RunCommand.ts`, `ShowCommand.ts`, `ValidateCommand.ts`, `CommandHandler.ts`, `StepQueue.ts`, `WorkerAdapter.ts`, `FlowValidator.ts`, `loadYaml.ts`

---

## HIGH — Violates project "fail fast, no silent suppression" standard

### 1. Silent returns when execution entry is not found

**Files:** `StepQueue.ts:109`, `StepQueue.ts:135`, `StepQueue.ts:152`

`onStepCompleted`, `onStepFailed`, and `markStepActive` all silently return when the execution entry is missing:

```ts
const entry = this.executions.get(executionId);
if (!entry) return;   // silent, hides contract violations
```

A missing entry means the caller passed a stale or wrong `executionId` — a bug, not a normal path. Per project standard, this must throw.

**Fix:**
```ts
const entry = this.executions.get(executionId);
if (!entry) throw new Error(`No execution entry for id: ${executionId}`);
```

---

### 2. Bare `catch {}` swallows ALL errors in polling loop

**File:** `RunCommand.ts:35`

```ts
try {
    const state = store.read(executionId);
    if (state.status === 'completed' || state.status === 'failed') return state;
} catch { /* not ready yet */ }
```

The comment claims this catches "not ready yet", but there is no type guard. A disk-full error, corrupted JSON, or permission error all land here and are silently consumed. The loop retries until timeout with no indication of what went wrong.

**Fix:** Check existence before reading (`if (!store.exists(executionId)) { continue; }`) so actual errors propagate.

---

### 3. Silent fallback `trace.outputs ?? {}` returns empty object on undefined

**File:** `WorkerAdapter.ts:65`, `WorkerAdapter.ts:72`

```ts
return (trace.outputs ?? {}) as Record<string, unknown>;
```

If `trace.outputs` is `undefined`, downstream step-output resolution silently gets nothing. Per project standard: no silent fallbacks.

**Fix:** Throw if `trace.outputs` is undefined instead of defaulting to `{}`.

---

### 4. `user_intervention` check happens after workspace allocation

**File:** `CommandHandler.ts:101-108`

The unsupported step type guard runs at line 101, but workspace allocation (`workspaceManager.allocate`) runs at line 76 and execution ID generation at line 83. A flow containing `user_intervention` steps allocates a workspace and burns an execution ID before being rejected.

**Fix:** Move the `user_intervention` check immediately after validation (after line 69), before any allocation.

---

## MEDIUM — Hard to read or fragile

### 5. Repeated `options.json && !options.human` guard (4 occurrences)

**File:** `RunCommand.ts:138`, `:149`, `:164`, `:173`

The output-mode condition is duplicated four times across one action callback.

**Fix:** Extract once at the top of the action: `const machineReadable = options.json && !options.human;`

---

### 6. 106-line inline action callback

**File:** `RunCommand.ts:82-187`

The entire command logic lives inside `.action(async (flowRef, options) => { ... })`. Untestable in isolation. Spans resolving paths, loading config, sending to daemon, handling `--wait`, and formatting output — five distinct concerns.

**Fix:** Extract to a named async function `runFlow(flowRef, options)` and call it from `.action`.

---

### 7. `as any` double-cast to access private internals, then reconstruct runner

**File:** `WorkerAdapter.ts:54-61`

```ts
const originalConfig = (this.stepRunner as any).config as any;
const patchedRunner = new StepRunner({ ...originalConfig, claudeEnv: { ... } });
```

Accesses a private field via `as any` and reconstructs a `StepRunner` from its own internal state. If `StepRunner`'s constructor signature or field name changes, this breaks silently at runtime.

**Fix:** Expose a `withEnv(env)` method on `StepRunner`, or accept the config object in `WorkerAdapter.execute`.

---

### 8. Double-cast `step as unknown as ModelFlowStep` indicates type incompatibility

**File:** `WorkerAdapter.ts:64`, `:71`

```ts
await patchedRunner.executeStep(step as unknown as ModelFlowStep, ...)
await this.stepRunner.executeStep(step as unknown as ScriptFlowStep, ...)
```

`step as unknown as T` means the compiler refused a direct cast — types are known incompatible. This suppresses a real type gap between `AssignableStep` and `flow-engine` step types.

**Fix:** Reconcile the types at the Protocol/flow-engine boundary rather than casting at each call site.

---

### 9. Brittle entry-point detection with hardcoded filename suffixes

**File:** `TaskIndex.ts:181-185`

```ts
const isEntryPoint =
    process.argv[1] !== undefined &&
    (process.argv[1] === fileURLToPath(import.meta.url) ||
        process.argv[1].endsWith('TaskIndex.js') ||
        process.argv[1].endsWith('TaskIndex.ts'));
```

The `fileURLToPath` comparison should be sufficient. The `.endsWith` fallbacks are a workaround for an undocumented tooling scenario. They will false-positive for any file named `TaskIndex.ts` in an unrelated package.

**Fix:** Remove the `.endsWith` fallbacks. If they are needed, add a comment explaining the specific tooling condition.

---

### 10. Unreadable nested expression for column width calculation

**File:** `ShowCommand.ts:146-148`

```ts
const COL_ID = Math.min(30, Math.max(12, ...steps.map((s: FlowStep) => s.id.length + (isBlocking(s) ? 4 : 0)))) + 2;
const COL_TYPE = Math.min(20, Math.max(10, ...steps.map((s: FlowStep) => stepType(s).length))) + 2;
const COL_DEPENDS = Math.min(36, Math.max(7, ...steps.map((s: FlowStep) => stepDepends(s, steps).length))) + 2;
```

Three one-liners with identical `Math.min(cap, Math.max(min, ...spread)) + padding` structure. The nesting makes the shared pattern invisible.

**Fix:**
```ts
function clampedWidth(values: number[], min: number, max: number, padding = 2): number {
    return Math.min(max, Math.max(min, ...values)) + padding;
}
```

---

### 11. `new FlowValidator(undefined)` — explicit undefined as constructor argument

**File:** `CommandHandler.ts:61`, `FlowValidator.ts:55`

```ts
const validator = new FlowValidator(undefined);
```

Passing `undefined` explicitly implies the parameter is required but intentionally empty. If optional, call with no argument.

**Fix:** `new FlowValidator()` if optional, or document what `undefined` means here.

---

### 12. File named as class but exports a function

**File:** `FlowValidator.ts:1-3`

The file-top comment acknowledges the naming violation: the file is named `FlowValidator.ts` but exports the function `validateFlowFile()`, not a class. Per project CLAUDE.md: "TypeScript files MUST be PascalCase matching their exported class." A comment documenting the violation is not a fix.

**Fix:** Rename to `validateFlowFile.ts`, or extract a `FlowValidatorCli` class wrapping `validateFlowFile`.

---

## LOW — Minor inconsistencies

### 13. `import * as fs from 'fs'` missing `node:` prefix

**File:** `loadYaml.ts:1`

All other files use `import * as fs from 'node:fs'`. `loadYaml.ts` uses the bare specifier.

**Fix:** `import * as fs from 'node:fs';`

---

### 14. `makeClient` factory called twice — duplicated send pattern

**File:** `RunCommand.ts:57-68`

`makeClient()` is called twice to create identical client instances. The factory closure adds indirection without benefit.

**Fix:** Inline the client construction or reuse the same instance after the first call.

---

### 15. `case 0: process.exit(0)` writes nothing in `--json` mode

**File:** `ValidateCommand.ts:16`

In JSON mode, exit 0 (valid flow) produces no stdout before exiting. A caller consuming `--json` gets silence for success — indistinguishable from the process being killed.

**Fix:** Write `{ valid: true }` to stdout before `process.exit(0)`.

---

### 16. Unvalidated cast on config section

**File:** `TaskIndex.ts:31`

```ts
const hooks = (tasksSection['hooks'] ?? {}) as Record<string, HookConfig[]>;
```

The type is asserted without runtime validation. A malformed config silently produces wrong hook data at dispatch time.

**Fix:** Add a runtime shape check, or document that `HookDispatcher` validates its input.

---

## Summary table

| # | Severity | File | Line | Category |
|---|----------|------|------|----------|
| 1 | HIGH | StepQueue.ts | 109, 135, 152 | Silent suppression |
| 2 | HIGH | RunCommand.ts | 35 | Silent suppression |
| 3 | HIGH | WorkerAdapter.ts | 65, 72 | Silent fallback |
| 4 | HIGH | CommandHandler.ts | 101-108 | Wrong execution order |
| 5 | MEDIUM | RunCommand.ts | 138, 149, 164, 173 | Repeated condition |
| 6 | MEDIUM | RunCommand.ts | 82-187 | Oversized inline callback |
| 7 | MEDIUM | WorkerAdapter.ts | 54-61 | as any / fragile internals |
| 8 | MEDIUM | WorkerAdapter.ts | 64, 71 | Type escape hatch |
| 9 | MEDIUM | TaskIndex.ts | 181-185 | Brittle heuristic |
| 10 | MEDIUM | ShowCommand.ts | 146-148 | Unreadable nested expression |
| 11 | MEDIUM | CommandHandler.ts, FlowValidator.ts | 61, 55 | Explicit undefined arg |
| 12 | MEDIUM | FlowValidator.ts | 1 | Naming convention violation |
| 13 | LOW | loadYaml.ts | 1 | Inconsistent import prefix |
| 14 | LOW | RunCommand.ts | 57-68 | Redundant factory pattern |
| 15 | LOW | ValidateCommand.ts | 16 | Silent JSON success |
| 16 | LOW | TaskIndex.ts | 31 | Unvalidated cast |

---

## Score: 5/10

4 high-severity findings directly violate the project "fail fast / no silent suppression" standard. The core logic (validation, scheduling, dispatch) is structurally sound, but `WorkerAdapter`'s `as any` introspection and the oversized `RunCommand` action callback are the two highest-friction areas for future maintenance.
