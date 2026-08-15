# FlowScheduler Refactoring Plan

## Problem

`FlowOrchestrator` (flow-engine) conflates two responsibilities:
1. **Scheduling** — dependency resolution, `when:` evaluation, loop/retry state, step ordering
2. **Execution** — calling `StepRunner` in-process

`flow-cli`'s `StepQueue` reimplements scheduling logic from scratch. As a result:
- `retry` is missing from flow-cli
- `loop:` is missing from flow-cli
- `timeout` is missing from flow-cli
- `when:` was missing until this session (added ad-hoc)
- Any future scheduling feature added to flow-engine must be manually ported to StepQueue

The fix: extract scheduling into a pure `FlowScheduler` module; both `FlowOrchestrator` and `StepQueue` become thin consumers of it.

---

## Target Architecture

```
packages/flow-engine/src/orchestration/
  FlowScheduler.ts          ← NEW: pure scheduling logic (sync, no I/O)

packages/flow-engine/src/executor/
  FlowOrchestrator.ts       ← REFACTORED: thin wrapper (FlowScheduler + StepRunner calls)

packages/flow-cli/src/daemon/
  StepQueue.ts              ← DELETED
  CommandHandler.ts         ← UPDATED: holds Map<executionId, FlowScheduler>
```

```
                  FlowScheduler (pure state machine, sync)
                  ┌────────────────────────────────────┐
                  │  dependency resolution              │
                  │  when: evaluation (ConditionEval)  │
                  │  retry counting                    │
                  │  loop state                        │
                  │  skip tracking                     │
                  └──────────────┬─────────────────────┘
                                 │
               ┌─────────────────┴─────────────────────┐
               ▼                                       ▼
  FlowOrchestrator (flow-engine)           CommandHandler (flow-cli)
  calls StepRunner in-process              dispatches to Worker via WebSocket
```

---

## FlowScheduler Interface

```typescript
// packages/flow-engine/src/orchestration/FlowScheduler.ts

export interface SchedulerStep {
  id: string;
  depends?: string[];
  when?: string;
  retry?: RetryConfig;
  loop?: LoopConfig;
  [key: string]: unknown;
}

export interface SchedulerContext {
  inputs: Record<string, unknown>;
  stepOutputs: Map<string, Record<string, unknown>>;
  taskMetadata?: Record<string, unknown>;
}

export interface ReadyItem {
  stepId: string;
  step: SchedulerStep;
}

export type StepOutcome =
  | { type: 'completed'; outputs: Record<string, unknown> }
  | { type: 'failed'; error: string };

export class FlowScheduler {
  constructor(private readonly context: SchedulerContext) {}

  /** Load all steps; returns initially ready items. */
  start(steps: SchedulerStep[], depends: Map<string, string[]>): ReadyItem[]

  /**
   * Mark a step as dispatched (in-flight). Prevents duplicate dispatch
   * if the consumer iterates ready items concurrently.
   * Call immediately after dispatching each ReadyItem.
   */
  acknowledge(stepId: string): void

  /**
   * Called when a step finishes. Returns newly ready items (may be empty).
   * Handles retry: if outcome is 'failed' and retry config allows, re-enqueues
   * the step and returns it as a ready item.
   */
  complete(stepId: string, outcome: StepOutcome): ReadyItem[]

  /** Inject steps dynamically (MCP provideSteps). Returns newly ready items. */
  inject(steps: SchedulerStep[]): ReadyItem[]

  /** True when no steps remain pending (all completed, skipped, or failed-terminal). */
  isTerminal(): boolean

  /** True when any step failed with no retry remaining. */
  hasFailed(): boolean

  /** Current step outputs map (read-only view). Used by CommandHandler to sync ExecutionContext. */
  getOutputs(): Map<string, Record<string, unknown>>
}
```

**Canonical `when:` context shape** (passed to `ConditionEvaluator`):
```typescript
{
  output: mergedOutputsOfDependencies,  // flat merge of all dep outputs
  inputs: context.inputs,
  task: context.taskMetadata ?? {}
}
```

**Required call sequence** (consumer responsibility):
```
start() → for each ReadyItem: acknowledge(stepId) → dispatch → complete(stepId, outcome)
```

---

## Phases (TDD)

### Phase 0 — Characterization tests (pre-condition)

**Goal:** lock down current behavior before touching anything. These tests are written against
`FlowOrchestrator` to capture behavior, then repurposed to test `FlowScheduler` in Phase 1.
**Do NOT delete** — rename to `FlowScheduler.regression.test.ts` after Phase 1.

Write `packages/flow-engine/src/orchestration/FlowScheduler.characterization.test.ts`:
- dependency resolution: steps become ready only when all deps complete
- `when: false` skips step; downstream steps still resolve (skip counts as completed)
- `when: true` runs step normally
- `when:` context: merged outputs of deps as `output`, inputs as `inputs`
- step failure stops execution when no retry configured
- retry: step re-enqueued when `retry.maxAttempts > 0` and step fails
- `acknowledge()` prevents duplicate dispatch of in-flight steps

All tests must pass before proceeding.

---

### Phase 1 — Create FlowScheduler (TDD)

**Red:** point characterization tests at `FlowScheduler` — they all fail (class doesn't exist).

**Files to create:**
- `packages/flow-engine/src/orchestration/FlowScheduler.ts`
- `packages/flow-engine/src/orchestration/FlowScheduler.test.ts` (full unit suite)

**Implementation extracts from `packages/flow-engine/src/executor/FlowOrchestrator.ts`:**
- `shouldExecuteStep()` → `FlowScheduler` internal (uses `ConditionEvaluator`)
- `processStepResults()` loop/retry logic → `FlowScheduler` internal (uses `LoopHandler`)
- dependency tracking (`findReadySteps` / DAG traversal) → `FlowScheduler` internal

**Green:** all characterization tests pass against `FlowScheduler`.

Export `FlowScheduler` from `packages/flow-engine/src/index.ts`.

---

### Phase 2 — Refactor FlowOrchestrator to use FlowScheduler

**Goal:** `FlowOrchestrator` (at `packages/flow-engine/src/executor/FlowOrchestrator.ts`)
orchestrates execution order via `FlowScheduler`; removes its own dep-tracking and `when:` logic.

**Constraint:** ALL existing `FlowOrchestrator` tests must pass without modification.

Run before touching FlowOrchestrator:
```bash
cd packages/flow-engine && npm test
```
All green → safe to proceed.

**Changes to `FlowOrchestrator.ts`:**
- Constructor creates a `FlowScheduler` per `orchestrate()` call
- Execution loop: `scheduler.start(flow.steps, deps)` → for each ready: `acknowledge()` → execute → `scheduler.complete(stepId, outcome)` → repeat
- Remove `shouldExecuteStep()`, `processStepResults()` (logic now in FlowScheduler)
- Keep `DAGBuilder.buildDAG()` + `DAGValidator.validate()` for upfront validation (not scheduling)

**Green:** all existing FlowOrchestrator tests still pass.

---

### Phase 3 — Replace StepQueue in flow-cli with FlowScheduler

**Red first:** write new tests in `CommandHandler.test.ts` verifying:
- `retry` behavior: step fails → CommandHandler re-dispatches per FlowScheduler retry
- `when:` end-to-end through CommandHandler
- transport failure (worker drops): step re-dispatched WITHOUT involving FlowScheduler
  (transport retry ≠ flow-level retry)

**Changes:**
- Delete `packages/flow-cli/src/daemon/StepQueue.ts` and `StepQueue.test.ts`
- `CommandHandler` holds `Map<executionId, FlowScheduler>` instead of a `StepQueue`
- `handleRun()`: creates `FlowScheduler`, calls `scheduler.start()`, dispatches ready items
- Worker `step_completed` → `scheduler.complete()` → dispatch new ready items
  → **sync `ExecutionContext.stepOutputs`** from `scheduler.getOutputs()` before next dispatch
- Worker `step_failed` → `scheduler.complete(stepId, {type:'failed',...})` → check `scheduler.hasFailed()`
- `inject` (MCP provideSteps) → `scheduler.inject(steps)` → dispatch newly ready items
- Parent-child metadata tracking (currently in StepQueue): moves into `CommandHandler` as a
  separate `Map<executionId, ParentChildIndex>` — NOT into FlowScheduler (it's UI metadata, not scheduling logic)
- Transport-level dispatch failure (worker dropped between `getIdleWorker()` and WebSocket send):
  handled in `CommandHandler.tryDispatch()` directly — does NOT call `scheduler.complete()`

**`Daemon.ts` changes (step_completed handler):**
- Remove call to `stepQueue.onStepCompleted()`
- Call `commandHandler.onStepCompleted(executionId, stepId, output)` which delegates to the scheduler

**Green:** all flow-cli tests pass (including E2E). flow-engine tests pass.

---

### Phase 4 — IStepExecutionAdapter (optional, post-Phase 3)

Only implement if Phase 3 reveals real boilerplate duplication between `CommandHandler` and
`FlowOrchestrator`. Interface:

```typescript
interface IStepExecutionAdapter {
  dispatch(stepId: string, step: SchedulerStep, context: SchedulerContext): Promise<StepOutcome>;
}
```

**Do not implement proactively.**

---

## Files Touched

| File | Action |
|------|--------|
| `packages/flow-engine/src/orchestration/FlowScheduler.ts` | CREATE |
| `packages/flow-engine/src/orchestration/FlowScheduler.test.ts` | CREATE |
| `packages/flow-engine/src/orchestration/FlowScheduler.characterization.test.ts` | CREATE (Phase 0) → RENAME to regression.test.ts after Phase 1 |
| `packages/flow-engine/src/executor/FlowOrchestrator.ts` | REFACTOR (Phase 2) |
| `packages/flow-engine/src/index.ts` | EXPORT FlowScheduler |
| `packages/flow-cli/src/daemon/StepQueue.ts` | DELETE (Phase 3) |
| `packages/flow-cli/src/daemon/StepQueue.test.ts` | DELETE (Phase 3) |
| `packages/flow-cli/src/daemon/CommandHandler.ts` | REFACTOR (Phase 3) |
| `packages/flow-cli/src/daemon/Daemon.ts` | UPDATE step_completed handler (Phase 3) |

---

## Success Criteria

- `StepQueue.ts` does not exist
- `FlowOrchestrator` contains no dependency resolution or `when:` evaluation logic
- All flow-engine tests pass
- All flow-cli tests pass (including E2E integration)
- `retry` works in flow-cli (tested)
- `when:` works in flow-cli via FlowScheduler (tested)
- `loop` works in flow-cli via FlowScheduler (tested)
- Adding a new scheduling feature to `FlowScheduler` automatically benefits both consumers

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `FlowOrchestrator.shouldExecuteStep()` uses `steps.*` syntax; `StepQueue` uses `output.*` | Normalize to canonical shape defined in interface section above; update both |
| No `acknowledge()` call → duplicate dispatch | Interface section documents required call sequence |
| `ExecutionContext.stepOutputs` desync after migration | Phase 3 explicitly requires sync from `scheduler.getOutputs()` before each dispatch |
| Parent-child tracking silently dropped | Phase 3 explicitly moves it to CommandHandler as separate Map |
| Transport retry vs flow-level retry conflation | Phase 3 explicitly separates the two paths |
| Phase 2 subtle behavior divergence undetected | Characterization tests kept as regression suite (not deleted) |
