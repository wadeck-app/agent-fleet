# Sub-step waves (`subStepStrategy: waves`)

Status: design, no code. Requester: flow author of `flow-test`.

## Goal

A parent with sub-steps in ordered waves. Same wave = parallel, all awaited, failures reported together in one message. Wave n+1 starts only when wave n fully passed. A failed wave restarts the parent with that wave's aggregated failures. Replaces the `wait-all` + `depends` emulation (10 edges in `flow-test`).

## Current code (facts read)

- `FlowScheduler.subStepStrategies.ts`: `SubStepStrategy` has `onChildFailure` / `onAllChildrenTerminal`, actions `restart-parent | wait | fail-parent`. Built-ins `RestartOnFirstFailure`, `WaitAll`, registered in the `FlowScheduler` constructor (`strategies` map; extra via `extraStrategies`).
- A sub-step implicitly depends on its parent (`DAGBuilder.ts`, `RunStepPreparer.ts`). The parent completes first, its outcome is stored in `deferredOutcomes`, then children run. `tryFireDeferredParent` fires when ALL `parentToChildren` are completed/failed/superseded.
- Failure path in `complete()`: strategy `wait` -> child superseded + `settleDependentsOfUnsuccessfulChild` (f0a005ee transitive settling over `reverseDeps` and `parent:`, restricted to `descendantsOf(parent)`, reasons into `skippedReasons`). `restart-parent` -> budget check `maxSubStepIterations` (default 3, `subStepLoopIterations`), `requeueChildrenForParent` (re-queues ALL static children, rebuilds `pendingDeps` from `originalDeps`), feedback via `buildSubStepFeedback` + `subStepRelaunchFeedback`.
- Engine-origin failures (209ab46b): `failEngineOrigin` fails the child and the deferred parent terminally, no retry, no relaunch, bypasses strategies.
- `step.subStepStrategy` is a free `string`; an unknown value only throws at runtime in the scheduler (no static check in `FlowValidator`).
- Warning `SUB_STEP_SIBLING_DEPENDENCY`: `validation/SubStepDependencyValidator.ts`, surfaced by `flow-cli/src/validation/FlowFileValidator.ts`.
- Daemon: `flow-cli/src/daemon/StepOutcomes.ts` calls `scheduler.complete`, `takeSkippedSteps`, `takeParentFailures`; `StepInjection.ts` / `InjectedStepState.ts` handle dynamic sub-steps.

## Decisions

1. Data model (`packages/flow-engine/src/types.ts`, `BaseFlowStep`): add `wave?: number`. `subStepStrategy` stays a string, new value `'waves'`; add exported const list of known strategies used by scheduler and validator (single source).
2. Wave of a nested sub-sub-step = the wave of its closest ancestor that is a direct child of a `waves` parent (computed, never declared). Declaring `wave` on a nested step is an error (see validation).
3. Restart scope: the parent restarts from wave 1 (all waves re-run), not from the failed wave. Reason: a model parent re-run may change code, so earlier green waves (cheap script checks) must be re-verified; it also matches the existing `requeueChildrenForParent`, which already re-queues every static child. Feedback contains only the failed wave's failures. Cost: re-running passed waves; an opt-in `restartFrom: failed-wave` is out of scope (open question 2).
4. Gaps allowed. Numbers are only an ordering key (sorted distinct values), so `wave: 10/20/30` works for later insertion. Negative, non-integer, `NaN`: error. `0` allowed.
5. Feedback format identical to `wait-all`: failures joined, each as `[id]\n<stderr>`, reusing `buildSubStepFeedback`. Only the failed wave's children appear; later-wave children are not mentioned as failed.
6. `maxSubStepIterations`: one wave failure = one parent iteration (shared budget on the parent, same counter). Budget exhausted -> same terminal message as `wait-all`, plus the wave number.
7. `retry` / `onFailure.goto` on a sub-step are evaluated before it counts as failed (unchanged order in `complete()`), so a retried check never ends the wave early.
8. Engine-origin failure of any sub-step (any wave, nested included): unchanged, parent fails terminally, no later wave starts, no relaunch.
9. `depends` between sub-steps stays legal. Same wave: unchanged (and the wait-all warning does NOT apply to `waves`, because inside a wave a failed dependency still settles the dependent as not run; see risk 2). Earlier wave: redundant, warning `WAVE_REDUNDANT_DEPENDS`. Later wave: error.

## Scheduler algorithm (`FlowScheduler.ts`, `FlowScheduler.subStepStrategies.ts`)

New state: `waveOrder: Map<parentId, number[]>`, `currentWave: Map<parentId, number>`, `waveOf: Map<childId, number>` (direct children only, filled in `start()` and when injected).

- Hold mechanism: a held child gets a synthetic dep token `wave:<parentId>:<n>` in `pendingDeps` (not in `originalDeps`/`reverseDeps`). `collectReady`, `isTerminal` and settling then need no special case. `requeueChildrenForParent` re-adds tokens for all waves except the first.
- Parent completes (deferred) -> release wave `first`: only its children lose the parent dep (existing release loop), later waves keep their token.
- Strategy interface: add action `{ type: 'release-wave'; wave: number }` and context fields `currentWave`, `currentWaveChildren`, `hasLaterWave`. `WaitAll` and `RestartOnFirstFailure` never return it.
- `Waves.onChildFailure`: pending children of the current wave -> `wait`; none pending -> `restart-parent` with the current wave's failures (`failedChildren` is per run and only holds current-wave failures, since later waves never ran).
- `Waves.onAllChildrenTerminal` (current wave all terminal): failures -> `restart-parent`; none and `hasLaterWave` -> `release-wave(next)`; none and last wave -> `wait` (normal deferred completion).
- `tryFireDeferredParent`: for `waves` the "all terminal" test is limited to the current wave's direct children (held later-wave children are legitimately pending). Handle `release-wave`: set `currentWave`, delete the token from each child of that wave, `collectReady()`.
- Failed wave: held later-wave children are settled as superseded with reason `not run: wave <n> failed, wave <m> was not started` through the existing `skippedReasons` channel (also settles their nested sub-steps), before the restart; `requeueChildrenForParent` then resets them. Reuse the f0a005ee closure rather than a second walker.
- Restart: `currentWave` reset to the first wave, tokens rebuilt.
- Dynamic (injected) sub-steps: `StepInjection.ts` rejects an injected step with `parent` = waves parent and no `wave` (fail loudly); a wave already released joins immediately, a lower wave than `currentWave` is rejected. Injected children are not requeued today, same limitation.
- Loop reset (`handleLoop`) must also clear `currentWave` / tokens for invalidated parents.

## Validation (`packages/flow-engine/src/validation`)

New `SubStepWaveValidator.ts` (+ `ValidationCode` entries, wired in `FlowValidator.ts` next to the sibling-dependency block, surfaced in `FlowFileValidator.ts` `SURFACED_WARNING_CODES` for warnings):

| Case | Severity |
|---|---|
| direct sub-step of a `waves` parent without `wave` | error |
| `wave` on a step without `parent` | error |
| `wave` on a sub-step whose parent uses another strategy | error |
| `wave` on a nested sub-step (parent is itself a sub-step) | error ("inherited from `<ancestor>`") |
| `wave` not a non-negative integer | error (schema level, with the offending value in the message) |
| `waves` parent with fewer than 2 distinct waves | warning (use `wait-all`) |
| `depends` to an earlier-wave sibling | warning, suggestion: remove it |
| `depends` to a later-wave sibling | error (can never be satisfied) |
| `subStepStrategy` not in the known list | error (today a runtime throw) |

`SubStepDependencyValidator` keeps its behaviour, only for `wait-all` (already the case; add a test pinning it).

## Docs / display

- `docs/FlowCapabilitiesGenerator.ts` (line ~86): document `waves` and `wave`, rerun the generator test/snapshot.
- `flow show` (CLI renderer, to be located in `flow-cli`; not found by name, first task of implementation): print `wave N` per sub-step, grouped by wave under the parent. Execution view: skipped later waves show the `skippedReasons` text.
- Web UI (`packages/web-frontend`): wave badge on sub-step nodes; BLOCKING rule, delegate to frontend-dev, can ship in a second PR.

## Backward compatibility

Purely additive: `wave` optional, `waves` is a new value. Flows without it are untouched. Stored executions have no `waveOf`; state is derived from the flow definition at `start()`, no migration. Fallback for an unrecognized strategy stays a fail-fast.

## TDD test list (write red first)

Scheduler (`FlowScheduler.waves.test.ts`):
- `waves: wave 2 children stay pending until every wave 1 child completed`
- `waves: wave 1 failure waits for all wave 1 siblings then restarts parent once`
- `waves: restart feedback contains only the failed wave failures, formatted [id]\n<stderr>`
- `waves: later waves are settled as not run with a wave reason when an earlier wave fails`
- `waves: parent restart re-runs from wave 1`
- `waves: last wave passing completes the parent`
- `waves: nested sub-sub-steps run in the wave of their ancestor and delay the next wave`
- `waves: nested sub-step failure fails its wave reviewer then restarts the parent with wave feedback`
- `waves: exhausted maxSubStepIterations fails the parent terminally`
- `waves: sub-step retry does not end the wave`
- `waves: engine-origin failure fails the parent without starting later waves or relaunching`
- `waves: gaps in numbering respect numeric order (10, 20, 30)`
- `waves: loop reset clears wave state`
- `wait-all and restart-on-first-failure behaviour unchanged` (existing suites stay green)

Validator (`SubStepWaveValidator.test.ts`): one test per row of the table, plus `no wave issue for a valid 3-wave flow` and `wait-all depends warning unchanged, absent for waves`.

Daemon / CLI: `StepInjection rejects an injected waves sub-step without wave`; `StepOutcomes records skipped later waves`; `flow show prints wave per sub-step`; generator test for the docs text. Final: an integration test with mock CLIs reproducing the `flow-test` shape (3 waves).

## Files to change

`flow-engine/src/types.ts`; `orchestration/FlowScheduler.ts`; `orchestration/FlowScheduler.subStepStrategies.ts` (or new `FlowScheduler.waves.ts` to stay under 500 lines: FlowScheduler.ts is already 984); `validation/SubStepWaveValidator.ts`, `ValidationTypes.ts`, `FlowValidator.ts`, `SchemaValidator.ts`; `docs/FlowCapabilitiesGenerator.ts`; `flow-cli/src/validation/FlowFileValidator.ts`, `daemon/StepInjection.ts`, flow show renderer; migrate `flow-test` to waves as acceptance.

## Risks

1. `FlowScheduler.ts` is ~984 lines, far above the 500 limit: extract the wave state/logic into its own class instead of growing it.
2. Same-wave `depends` still skips the dependent when its dependency fails (f0a005ee); in a wave the author expects both to report. Accepted for the first version; the new validator should warn on same-wave `depends` only if it proves confusing.
3. Held-token approach touches `requeueChildrenForParent` and `handleLoop`; missed reset = hang (never terminal). Cover with the loop and restart tests.
4. Re-running wave 1 on each restart costs time for expensive early waves.

## Open questions

1. Same-wave `depends`: allow with the existing skip semantics (current plan) or forbid?
2. Opt-in `restartFrom: failed-wave` for expensive early waves? Not in v1.
3. Should a wave failure consume one iteration of `maxSubStepIterations` (current plan) or have a separate per-wave budget?
4. Which file renders `flow show`, and does the web UI need waves in v1?
