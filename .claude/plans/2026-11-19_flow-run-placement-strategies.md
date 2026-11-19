# Run placement strategies

Status: options only, nothing implemented. Todo #24.

## Today (read in code, not run)

- Each step is placed on its own: `requires` (guarantees from the worker source), `profile` (a named `requires` set), `labels` (worker labels). Code: `StepPlacementBuilder`, `StepRouter.select`.
- `requires` is additive: a step adds to the flow's list, it can never remove or replace an entry (`schema-reference.md`, `requires` > Merge).
- Several eligible idle workers: registered before forked, then up-to-date version, then first registered. The run of the step is not looked at (`DefaultStepDistribution`).
- A worker that holds a run's sandbox is not offered to other runs (D4, done); nothing makes a run prefer one worker for its own steps.

## Gaps

| Gap | Effect |
|---|---|
| G1 No stickiness | Steps of one run may land on different workers of the same capability; a second sandbox may be created for the run, its state is not shared (not verified). |
| G2 No override | A flow-level default (`requires: [sandbox]`) cannot be replaced on one step: a step needing `os=linux` asks for both and no worker has both, so it waits and fails. |
| G3 Leaving and coming back | Works for the sandbox (the hold persists until run end, the run's own steps are still offered the worker); the step waits if the worker is busy. |

Workaround for G2 today: no flow-level `requires`; write it on each step that needs it.

## Options for G2 (default plus override, by capability)

| Option | Shape | For | Against |
|---|---|---|---|
| A. Replace mode on the step | `requires: { replace: [os=linux] }` or `requiresMode: replace` | Small change, one rule | New syntax in a list field, easy to misread |
| B. Named placements | flow `placements: { main: [sandbox], linux: [os=linux] }`, steps say `placement: linux`, default `placement: main` at flow level | Readable, reusable, validated offline (unknown name = error) | New concept next to `requires` and `profile` |
| C. Profile override | A step `profile` replaces the flow-level `requires` set | No new field | Overloads `profile`; hides that `requires` is dropped |

Recommendation: B. It names the intent ("main" vs "linux"), keeps `requires` additive for guarantees, and `flow show` can print the placement per step. A is the cheapest if only one override per flow is ever needed.

## Options for G1 (stickiness)

| Option | Behaviour | For | Against |
|---|---|---|---|
| S1. Prefer previous worker | Among eligible idle workers, order the one that served the previous step of the run first | Soft, no new field, no deadlock | Does not wait for a busy preferred worker |
| S2. Pin per placement | `affinity: run` on a placement: all steps of that placement go to the worker that served its first step; wait if busy | Real guarantee for stateful work (a sandbox) | A dead pinned worker needs a rule (fail the step with a message) |

Recommendation: S1 by default for every run (no config), S2 as an explicit field on a placement when state must be kept. The sandbox already gets S2 through the hold (D4).

## Decisions needed before coding

- Option A, B or C for G2.
- Whether S1 is acceptable as a default change (it alters which worker is picked, never whether a step runs).
- Validation: placement names checked offline (`flow validate`), guarantees at run start as today.
