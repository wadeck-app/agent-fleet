# Contributions to the flow module's action slots

- The five contributions (`execution-link`, `execution-action`, `execution-row-link`, `execution-row-action`, `executions-action`) are a bare `flow-chart:FlowChartLink` with `target: flow|execution|index` (`flow` reads `flowId`, `execution` reads `executionId`); the slots accept nothing else.
- Order on the detail page and in the row panel: [Flow definition] (`*-links` slot) [Logs] (flow's own) [Flow chart] (`*-actions` slot). A slot renders where the flow view puts it, so two slots are the only way to place a contribution before an own button.
- The style comes from flow-core `FLOW_ACTION_BUTTON_STYLE`, not from props: any other key renders an error. Chart-header "Logs" uses the same constant.
- Rules and enforcement: `app-module-flow/.docs/action-buttons.md`. Tests: `FlowChartLink.test.tsx`, `SlotContributions.test.ts`.
