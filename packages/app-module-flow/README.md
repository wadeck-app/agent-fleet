# app-module-flow

app-core module exposing flow state (executions, workers, logs, plugins) as read-only HTTP routes and DSL pages. All logic comes from `flow-core`; this package only validates query parameters, maps errors to HTTP status and projects records (no step `meta`).

Routes (`/api/modules/flow/...`): `GET /executions`, `/executions/:id`, `/flows`, `/workers`, `/logs`, `/plugins`, `/plugins/:id`. Registered in `src/backend/*Routes.ts`.

Pages: `src/dsl-views/*.yaml`, referenced by `manifest.json`. `views.test.ts` checks that every `$sources` url has a route and every link lands on a manifest page.

Known limit: the executions flow filter is set by clicking a row of the flows table (`?flow=`). A text/select bound to a URL parameter needs a dsl-ui change (only `Pagination` and `PageSizeSelect` take `urlParam`).

## Design variants (A/B)

Three views declare design alternatives with the dsl-ui `AbTest` node, to compare them in the real pages:

| View                         | id                       | Variants (first = `initial`)            |
| ---------------------------- | ------------------------ | --------------------------------------- |
| `executions-widget.yaml`     | `flow-widget-design`     | `list`, `tiles`, `compact`              |
| `executions-page.yaml`       | `flow-executions-design` | `table`, `filters-first`, `flows-aside` |
| `execution-detail-page.yaml` | `flow-execution-design`  | `steps-table`, `summary-first`          |

- Pick one in the A/B dock of a development shell, or force it for one page load with `?ab.<id>=<variant>`. The dock keeps the choice in `localStorage` key `ab.<id>`.
- Production shells and shells with the dock disabled render `initial`.
- Needs a shell with dsl-ui >= 2026.10.19-110. An older shell shows "Unknown component type: AbTest" for these three views. The manifest declares no `dslLib` range for it (that would require a `src/dsl-components` entry), so app-core does not refuse the module on an old shell.
- Keep ids and variant keys stable: renaming one drops the choice stored in browsers. `views.test.ts` pins them.
- Backend fields only some variants read: `lastRun` and `compact` (widget route), `statusFiltersCounted` and `statusCounts` (executions route), `stepsSummary`, `retryCount` and `errorSummary` (detail route).

To remove the experiment once a variant is chosen: replace the `AbTest` node by the `view` of the chosen variant (for the widget, make it the document root and keep `$sources`), delete the other variants, then resolve the YAML anchors (`&name` defined in one variant, `*name` used in others) by inlining them, and remove the backend fields no remaining view reads. Update `EXPECTED` in `views.test.ts`.

```
npm test            # builds flow-core first
npm run bundle      # dist-module/, what flow-cli registers with app-core
```

The flow-cli daemon registers `dist-module/manifest.json` on start; do not register it by hand on a shared app-core.
