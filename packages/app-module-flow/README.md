# app-module-flow

app-core module exposing flow state (executions, workers, logs, plugins) as read-only HTTP routes and DSL pages. All logic comes from `flow-core`; this package only validates query parameters, maps errors to HTTP status and projects records (no step `meta`).

Routes (`/api/modules/flow/...`): `GET /executions`, `/executions/:id`, `/flows`, `/workers`, `/logs`, `/plugins`, `/plugins/:id`. Registered in `src/backend/*Routes.ts`.

Pages: `src/dsl-views/*.yaml`, referenced by `manifest.json`. `views.test.ts` checks that every `$sources` url has a route and every link lands on a manifest page.

Known limit: the executions flow filter is set by clicking a row of the flows table (`?flow=`). A text/select bound to a URL parameter needs a dsl-ui change (only `Pagination` and `PageSizeSelect` take `urlParam`).

## Times and table columns

- Every timestamp is sent as ISO 8601 (`startedAt`, `completedAt`, `lastStartedAt`, `timing`, `lastRun`); the route checks it is a valid date (`requireTimestamp`, flow-core) and fails otherwise. No server-side label ("Oct 18 16:15"), no "5m" age.
- The views show them with the dsl-ui DataTable column `format: datetime`, the formatter of the other modules (queue) and tables of app-core: `Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })`, so the viewer's locale, no seconds (en-US: "10/18/26, 4:15 PM"). Source: dsl-ui `DataTable.tsx` `formatValue`.
- A Badge, StatTile or composed string cannot format a timestamp: the detail page shows the run start and end as a one-row table (`timing`), the tiles widget shows the last run as a one-row table (`lastRun`).
- Shells older than dsl-ui 122 ignore `format` and show the raw ISO text.
- Durations stay readable text from the backend ("12.3s"): the DataTable `format: ms` only appends "ms" to a number.

Column options used (dsl-ui >= 122, older shells keep `key` and `label` only): `format` for times, `badge` for status words (ok/FAILED/running/waiting/retry/pending, worker idle/busy), `nowrap` for short values (times, counts, status), `truncate` for names, `mono` for ids and versions, `muted` for secondary values. `views.test.ts` pins: every `*At` column is `format: datetime` in every A/B variant, no timestamp in a Badge or StatTile.

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
