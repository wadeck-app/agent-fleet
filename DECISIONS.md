# Phase 3 Implementation Decisions & Questions

## Date: 2025-12-01

## Overview
Implementing feedback loops with `goto` to allow steps to jump back to earlier steps for iterative improvement.

---

## Design Decisions

### 1. Loop Metadata Storage
**Decision**: Store loop metadata in `FlowExecutionContext` and track per-step iterations
**Rationale**: Allows tracking iteration counts and prevents infinite loops
**Implementation**:
- `context.meta.iterations: Map<string, number>` - tracks iterations per step
- `context.meta.totalLoops: number` - total number of loops in flow execution

### 2. Descendant Step Invalidation
**Decision**: When a `goto` is triggered, mark the target step and ALL its descendants as incomplete
**Rationale**: Ensures proper re-execution of dependent steps after returning to an earlier point
**Implementation**: Use DAGBuilder.getDescendants() to find all affected steps

### 3. Max Iterations Default
**Decision**: Default maxIterations = 3 if not specified
**Rationale**: Prevents accidental infinite loops while allowing reasonable retry attempts
**User can override**: Set `onFailure.maxIterations: 10` in flow definition

### 4. Loop Trigger on Step Failure
**Decision**: `goto` only triggers when a step FAILS (exitCode !== 0)
**Rationale**: Clear semantics - success continues forward, failure can loop back
**Alternative considered**: Conditional goto based on outputs (deferred to Phase 5 with `when`)

### 5. Loop Limit Enforcement
**Decision**: When maxIterations is exceeded, FAIL the entire flow
**Rationale**: Fail-safe approach - forces attention to persistent issues
**Alternative considered**: Continue without looping (rejected - hides problems)

---

## Open Questions (for user review)

### Q1: Should loops count against step-level OR flow-level limits?
**Current implementation**: Step-level (each step has its own iteration counter)
**Alternative**: Flow-level global limit (max 10 total loops across all steps)
**Impact**: Flow-level prevents infinite loops more strictly but less flexible

### Q2: Should successful loops reset the iteration counter?
**Example**: implement(fail) → test(pass) → review(fail) → implement(pass)
**Current**: Counter never resets - implement would have iteration=2
**Alternative**: Reset counter on first success
**Impact**: Affects how maxIterations is calculated

### Q3: Should we add loop metadata to task comments automatically?
**Current**: No automatic comments
**Proposed**: Auto-comment "[Loop] Returning from {stepId} to {targetId} (iteration {N})"
**Impact**: Better visibility but more noise in task history

### Q4: Should steps in between target and current be marked as "skipped"?
**Scenario**: A → B → C → D, if D loops to B, what happens to C?
**Current**: C is marked incomplete and will re-execute after B
**Alternative**: Mark C as "skipped" in this iteration
**Impact**: Affects trace clarity

---

## Implementation Notes

### Step Failure Detection
Steps fail when:
1. Script exitCode !== 0
2. Model step throws an error
3. Output extraction fails

### Loop Flow
1. Step fails
2. Check if `onFailure.goto` is defined
3. Check if current iteration < maxIterations
4. Mark target step and descendants as incomplete
5. Continue DAG execution from target

### Trace Recording
Each loop creates entries in the trace:
- Original step execution with failure
- Loop metadata (from → to, iteration count)
- Re-execution of target step

---

## Testing Strategy

### Test Flow 1: test-loop (Simple Retry)
- implement step (always succeeds)
- test step (fails first 2 times, succeeds on 3rd)
- Uses script with iteration counter file

### Test Flow 2: test-review-loop (Review Feedback)
- implement step
- review step (fails first time with feedback, succeeds second time)
- Simulates code review process

---

## Future Enhancements (Post-Phase 3)

1. **Conditional Goto**: `goto` based on output values, not just failure
2. **Loop Hooks**: `onLoopStart` / `onLoopEnd` callbacks
3. **Loop Visualization**: Better UI representation of loop iterations
4. **Loop Limits Per Target**: Different maxIterations for different goto targets
5. **Loop Context Variables**: `${{ loop.iteration }}`, `${{ loop.previousOutput }}`

---

## Risk Mitigation

### Risk: Infinite Loops
**Mitigation**: Hard maxIterations limit with fail-safe behavior

### Risk: Complex Flow Logic
**Mitigation**: Comprehensive validation in FlowValidator

### Risk: Difficult Debugging
**Mitigation**: Detailed trace with loop metadata and timestamps

---

## Timeline
- Start: 2025-12-01 14:45
- Completion: 2025-12-01 18:20
- Status: ✅ COMPLETED

---

## Implementation Summary

### What Was Implemented

#### 1. Type Definitions (types.ts)
- Added `FailureConfig` interface with `goto`, `maxIterations`, and `addComment` fields
- Added `onFailure?: FailureConfig` to `BaseFlowStep`
- Extended `FlowExecutionContext` with loop metadata:
  - `meta.iterations: Map<string, number>` - per-step iteration tracking
  - `meta.totalLoops: number` - total loops in flow execution

#### 2. LoopHandler Class (loop-handler.ts) - NEW
Complete implementation with:
- `checkLoop()` - Determines if a step failure should trigger a loop
- `handleLoop()` - Invalidates target step and descendants, updates iteration counts
- `isIterationLimitExceeded()` - Checks iteration limits
- `getLoopPath()` - Gets steps involved in loop (for debugging/visualization)
- Full error handling and validation

#### 3. FlowExecutor Integration (flow-executor.ts)
- Integrated LoopHandler into execution pipeline
- Added iteration tracking initialization
- Modified step result processing to check for loop triggers
- Implemented loop handling logic:
  - On failure with goto: invalidate target + descendants, increment counters
  - On max iterations exceeded: fail entire flow with clear error
  - On success: mark step as completed normally

#### 4. FlowValidator Updates (flow-validator.ts)
- Added validation for `onFailure.goto`:
  - Checks target step exists
  - Validates maxIterations is positive integer
- Added to `validateStepReferences()` method
- Uses existing ValidationCode.UNDEFINED_STEP for consistency

#### 5. FlowRegistry Updates (flow-registry.ts)
- Added `onFailure: data.onFailure` to `parseFlowStep()`
- Ensures YAML configuration is properly loaded

#### 6. Test Flows (.agent-fleet/flows.yaml)
Created two comprehensive test flows:

**test-loop**: Simple retry pattern
- implement → test (fails 2x, passes 3rd) → done
- Uses file-based iteration tracking (test-iter1.tmp, test-iter2.tmp)
- maxIterations: 3

**test-review-loop**: Code review feedback pattern
- implement → review (requests changes 1st, approves 2nd) → deploy
- Simulates feedback loop with review-feedback.tmp file
- maxIterations: 2

### Key Design Decisions Made

1. **Step-level iteration tracking** (not flow-level)
   - Each step tracks its own iterations independently
   - More flexible for complex flows with multiple loops

2. **Fail-safe behavior on max iterations**
   - Flow fails completely when limit is exceeded
   - Clear error message indicates which step and why
   - Prevents silent failures or infinite loops

3. **Descendant invalidation**
   - When goto triggers, target step AND all descendants are re-executed
   - Ensures data consistency and proper re-evaluation

4. **Iteration counter never resets**
   - Counter increments on each loop trigger
   - Doesn't reset on success
   - Simplifies logic and provides accurate loop count

### Testing Strategy

Both test flows use file-based counters to track iterations:
- Simple and Windows-compatible (no complex bash variables)
- Easy to observe behavior during testing
- Automatic cleanup on success

### Open Questions Status

1. **Q1: Step-level vs flow-level iteration limits**
   - ✅ **RESOLVED**: User chose step-level
   - Decision: Each step tracks its own iterations independently

2. **Q2: Should successful loops reset iteration counter?**
   - ✅ **RESOLVED**: User chose to add as option
   - Decision: Added `resetOnSuccess: boolean` (default: false)

3. **Q3: Auto-comment loop metadata to task?**
   - ⏳ **DEFERRED**: Planned for Phase 4 (Auto-Comments & Reports)
   - Current: No automatic comments
   - Proposed: Auto-add "[Loop] Returning from X to Y (iteration N)"

4. **Q4: Mark skipped steps between target and current?**
   - ✅ **RESOLVED**: User chose to add skipOnLoop flag
   - Decision: Added `skipOnLoop: boolean` per-step flag
   - Behavior: Steps with skipOnLoop=true are skipped during loops

### Files Changed

- src/flow/types.ts (+ FailureConfig, + FlowExecutionContext.meta)
- src/flow/loop-handler.ts (NEW - 263 lines)
- src/flow/flow-executor.ts (+ loop handling logic)
- src/flow/flow-validator.ts (+ onFailure validation)
- src/flow/flow-registry.ts (+ onFailure parsing)
- .agent-fleet/flows.yaml (+ test-loop, test-review-loop flows)

---

## Phase 3.1: Advanced Loop Features (2025-12-01)

### Additional Features Implemented

After user feedback, two critical features were added:

#### 1. resetOnSuccess
**User Request**: "What's the advantage of reseting the counter? I imagine for a flow A => B => C => D if all B, C and D goto A, it could reach the limit."

**Implementation**:
```yaml
- id: test
  onFailure:
    goto: implement
    maxIterations: 3
    resetOnSuccess: true  # NEW
```

**Behavior**: When target step (implement) completes successfully, reset iteration counter for all steps that have `goto: implement` with `resetOnSuccess: true`.

**Use Case**: Flow A → B → C → D where B, C, D all goto A
- Without reset: Could hit maxIterations quickly
- With reset: Each successful A resets counters for B, C, D

**Code**:
- `LoopHandler.handleResetOnSuccess()` method
- Called in FlowExecutor when step completes successfully
- Logs: `🔄 Reset iteration counter for 'test' (was 2) due to resetOnSuccess`

#### 2. skipOnLoop
**User Request**: "is there a way to say that... B is not necessary, that we can skip it ? like b-approved or equivalent?"

**Implementation**:
```yaml
- id: review-quality
  depends: [implement]
  skipOnLoop: true  # NEW - only runs first time
```

**Behavior**: Step marked with `skipOnLoop: true` is automatically skipped (marked as completed) when a loop is triggered.

**Use Case**: Multi-review flow where some reviews (quality, consistency) only need to run on first pass, but others (security, usability) re-run on each iteration.

**Code**:
- `LoopHandler.handleLoop()` checks `step.skipOnLoop`
- Skipped steps are marked as completed immediately
- Logs: `⏭️  Skipped 2 step(s) (skipOnLoop=true): review-quality, review-consistency`

#### 3. Test Flow: test-multi-review
Comprehensive test demonstrating both features:
- **implement** → 4 parallel reviews → **deploy**
- **review-quality** (skipOnLoop=true) - runs once
- **review-security** (goto implement, resetOnSuccess) - can loop
- **review-consistency** (skipOnLoop=true) - runs once
- **review-usability** (goto implement, resetOnSuccess) - can loop

**Expected Behavior**:
1. First pass: All 4 reviews run in parallel
2. If security fails: implement → review-security only (quality+consistency skipped)
3. If usability fails: implement → review-usability only (quality+consistency skipped)
4. If both fail sequentially: implement gets 2 separate iterations
5. resetOnSuccess ensures counters reset after successful implement

### Updated Design Decisions

**Q2 Resolution: Reset counter option**
- **Decision**: Added `resetOnSuccess: boolean` (default: false)
- **Rationale**: Provides flexibility for flows with multiple loop sources
- **User Input**: "Great question" - accepted proposal

**Q4 Resolution: Skip steps during loops**
- **Decision**: Added `skipOnLoop: boolean` per-step flag
- **Rationale**: More granular than global option, allows one-time setup/validation steps
- **User Input**: "yes great" - accepted proposal

### Files Changed (Phase 3.1)
- src/flow/types.ts (+ resetOnSuccess, + skipOnLoop, + inLoop)
- src/flow/loop-handler.ts (+ handleResetOnSuccess, updated handleLoop)
- src/flow/flow-executor.ts (+ resetOnSuccess handling, + inLoop tracking)
- src/flow/flow-validator.ts (+ validation for new fields)
- src/flow/flow-registry.ts (+ parsing for skipOnLoop)
- .agent-fleet/flows.yaml (+ test-multi-review flow)

### Next Steps

Phase 3 is complete! Ready for:
- Phase 4: Auto-Comments & Reports (onComplete/onFailure hooks)
- Phase 5: Conditional Execution with `when` expressions
- User testing of feedback loops with:
  - test-loop (simple retry)
  - test-review-loop (review feedback)
  - test-multi-review (skip + reset features)
