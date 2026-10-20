# app-module-flow-chart

app-core module `flow-chart`: draws a flow as a graph (steps, `depends`, `when`, `onFailure.goto` loops); for an execution, steps are colored by status. It `requires` the `flow` module and fills its slots. Graph logic is `buildFlowGraph` / `FlowQueryService.getFlowGraph` in `flow-core`; this package only maps errors to HTTP and draws.

## What it adds to `flow`

| Where                                                          | What                                                         | Source                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Slot `flow:execution-actions` (execution page)                 | "See flow chart" button                                      | `src/dsl-views/execution-action.yaml`  |
| Slot `flow:executions-actions` (executions list)               | "Flow charts" button (no per-row slot exists in `DataTable`) | `src/dsl-views/executions-action.yaml` |
| Menu `flow:nav` (Flow's side menu) `/modules/flow-chart/flows` | Flows that ran; a row opens the definition chart             | `flows-page.yaml`                      |
| Route `/modules/flow-chart/flows/:flowId`                      | Definition chart                                             | `flow-chart-page.yaml`                 |
| Route `/modules/flow-chart/flows/runs/:id`                     | Run chart, refreshed every 4 s while the run is live         | `execution-chart-page.yaml`            |

Routes (`/api/modules/flow-chart/...`): `GET /graph?executionId=` or `?flowId=` (exactly one), `GET /flows`.

Components (`src/dsl-components`, bundled with xyflow and dagre): `flow-chart:FlowGraph`, `flow-chart:FlowChartLink`. The link is a component because a contributed view cannot concatenate `$route.id` into a path.

## `requires`

`{ "flow": "*" }`: app-core matches with `includePrerelease`, so CI versions such as `2026.10.19-663-3ea4c829` and local `0.1.0` both satisfy it. The module has no `nav` page of its own (that would add a top-bar tab); its index is in the side menu of flow through `flow:nav`, and the run chart is under `/flows/runs/:id` because the shell gives Flow's tab, menu and accent only to routes below a menu page path (`/flows`), which needs an app-core with that feature (commit b2aa095 or later). A date with a zero-padded day (`2026.10.05`) is not valid semver and never matches any range.

`check` / `package` read the provider from `node_modules/app-module-flow/dist-module` (devDependency), so build `app-module-flow` first.

## Build

```
npm test          # builds flow-core first; node + jsdom projects
npm run bundle    # flow-core build, Tailwind (style.css, gitignored), app-core-cli package
```

`BUNDLE_VERSION` is set by `flow-cli/ci/scripts/bundle.ts`. The daemon registers `flow` then `flow-chart`; do not register by hand on a shared app-core.
