# Contributions to the flow module's action slots

- The four contributions (`execution-link`, `execution-row-link`, `execution-row-action`, `executions-action`) are a bare `flow-chart:FlowChartLink` with `target: flow|execution|index` (`flow` reads `flowId`, `execution` reads `executionId`); the slots accept nothing else.
- The execution page has no "Flow chart" button and the chart header no "Logs" button: the Chart and Logs tabs of the shell (group `flow:execution`) are the way. `flow:execution-actions` is left unfilled on purpose (`SlotContributions.test.ts`, `manifest.test.ts`). The row panel has no tabs: order there is [Flow definition] (`*-links` slot) [Logs] (flow's own) [Flow chart] (`*-actions` slot). A slot renders where the flow view puts it, so two slots are the only way to place a contribution before an own button.
- The style comes from flow-core `FLOW_ACTION_BUTTON_STYLE`, not from props: any other key renders an error.
- Rules and enforcement: `app-module-flow/.docs/action-buttons.md`. Tests: `FlowChartLink.test.tsx`, `SlotContributions.test.ts`.
