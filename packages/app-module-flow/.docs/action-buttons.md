# Action buttons next to an execution

One look everywhere: a small secondary navigating button (`ButtonLink`, `variant: secondary`, `size: sm`). Detail header, executions page, expanded row panel and chart header all use it. Order next to an execution: [Flow definition] [Logs] [Flow chart] (and Details first in the row panel).

| Rule                           | Defined in                                                                                 | Enforced by                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Style `{ variant, size }`      | flow-core `FLOW_ACTION_BUTTON_STYLE`                                                       | flow `views.test.ts` (own YAML), flow-chart component and view tests                       |
| Root `$type` of a contribution | flow-core `FLOW_ACTION_SLOT_ACCEPTS`, mirrored in `manifest.json` `expose.slots.*.accepts` | app-core `check`, `package` and load (refusal proven by `SlotContributionRefusal.test.ts`) |
| `requires.flow` range          | flow-core `FLOW_REQUIRED_RANGE`                                                            | flow-chart `manifest.test.ts`                                                              |

- The platform checks only the root `$type`, never props. A slot accepting `ButtonLink` could not stop `variant: primary`, so the slots accept one component, `flow-chart:FlowChartLink`, whose style is not a prop and which renders an error for any key besides `target`, `executionId` and `flowId` (`target: flow` links the definition chart, `execution` the run chart, `index` the flows list).
- Two slots per place (`execution-links` / `execution-actions`, `execution-row-links` / `execution-row-actions`) exist only so a contribution can sit before or after the module's own Logs button; both accept the same root.
- The platform has no per-slot allow-list of contributors: any module that `requires` flow may contribute the accepted `$type`.
- Another module contributes only after its component (fixed style, closed keys) is added to `FLOW_ACTION_SLOT_ACCEPTS` and `manifest.json`.
- This module has no `dslLib`, so its own buttons are plain `ButtonLink` nodes with the same two props, pinned by tests.
