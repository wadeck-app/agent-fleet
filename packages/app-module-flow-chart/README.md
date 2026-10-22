# app-module-flow-chart

app-core module `flow-chart`: draws a flow as a graph (steps, `depends`, `when`, `onFailure.goto` loops); for an execution, steps are colored by status. It `requires` the `flow` module and fills its slots. Graph logic (`buildFlowGraph`, `annotateGraph`, run path, step I/O) is in `flow-core`, served by `FlowQueryService.getFlowGraph`; page paths come from `flow-core` too (browser code imports them from `flow-core/graph-tree`); this package only maps errors to HTTP and draws.

## What it adds to `flow`

| Where                                                          | What                                                    | Source                                    |
| -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Slot `flow:execution-actions` (execution page)                 | "See flow chart" button                                 | `src/dsl-views/execution-action.yaml`     |
| Slot `flow:execution-row-actions` (expanded row)               | "See flow chart" button, id from `$ctx.row.executionId` | `src/dsl-views/execution-row-action.yaml` |
| Slot `flow:executions-actions` (executions list)               | "Flow charts" button                                    | `src/dsl-views/executions-action.yaml`    |
| Menu `flow:nav` (Flow's side menu) `/modules/flow-chart/flows` | Flows that ran; a row opens the definition chart        | `flows-page.yaml`                         |
| Route `/modules/flow-chart/flows/:flowId`                      | Definition chart                                        | `flow-chart-page.yaml`                    |
| Route `/modules/flow-chart/flows/runs/:id`                     | Run chart, refreshed every 4 s while the run is live    | `execution-chart-page.yaml`               |

Routes (`/api/modules/flow-chart/...`): `GET /graph?executionId=` or `?flowId=` (exactly one), `GET /flows?q=&health=&page=&limit=` (adds `runCount`, `lastStatus`, `lastRunId`, `lastRunAt` as ISO, `health`, `chartPath`, `lastRunChartPath`), `GET /flows/health?q=` (flows grouped failing / running / healthy, up to 500).

Components (`src/dsl-components`, bundled with xyflow and dagre): `flow-chart:FlowGraph`, `flow-chart:FlowChartLink`, `flow-chart:FlowIndexList` (`layout: cards | list`; the DSL cannot repeat a node per row). The link is a component because a contributed view cannot concatenate `$route.id` into a path.

## Run path, step inputs/outputs, header, sub-steps, flows index

A run chart numbers the steps in run order, marks skipped / not reached steps, and fades the edges the run did not follow; the step panel lists inputs, outputs, data-flow links and a Logs link (`?step=`). Pages carry no "Back to" link (the shell has a breadcrumb). The execution record holds no step input or output values and is not secret-masked: details in [.docs/chart-and-index.md](.docs/chart-and-index.md).

## `requires`

`{ "flow": "*" }`: app-core matches with `includePrerelease`, so CI versions such as `2026.10.19-663-3ea4c829` and local `0.1.0` both satisfy it. The module has no `nav` page of its own (that would add a top-bar tab); its index is in the side menu of flow through `flow:nav`, and the run chart is under `/flows/runs/:id` because the shell gives Flow's tab, menu and accent only to routes below a menu page path (`/flows`), which needs an app-core with that feature (commit b2aa095 or later). A date with a zero-padded day (`2026.10.05`) is not valid semver and never matches any range.

`check` / `package` read the provider from `node_modules/app-module-flow/dist-module` (devDependency), so build `app-module-flow` first.

## Build

```
npm test          # builds flow-core first; node + jsdom projects
npm run bundle    # flow-core build, Tailwind (style.css, gitignored), app-core-cli package
```

`BUNDLE_VERSION` is set by `flow-cli/ci/scripts/bundle.ts`. The daemon registers `flow` then `flow-chart`; do not register by hand on a shared app-core.
