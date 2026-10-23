# Contributions to the flow module's action slots

- The three contributions (`execution-action`, `execution-row-action`, `executions-action`) are a bare `flow-chart:FlowChartLink` with `target: execution|index`; the slots accept nothing else.
- The style comes from flow-core `FLOW_ACTION_BUTTON_STYLE`, not from props: any other key renders an error. Chart-header "Logs" uses the same constant.
- Rules and enforcement: `app-module-flow/.docs/action-buttons.md`. Tests: `FlowChartLink.test.tsx`, `SlotContributions.test.ts`.
