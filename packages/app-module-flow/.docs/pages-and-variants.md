# Pages, columns, execution logs, design variants

## Executions page

- Filters are URL-bound controls: `SearchBar` `?flow=` (route param `flowContains`, case-insensitive substring; `flow` stays exact) and `CompactSelect` `?status=` (`completed`, `failed`, `running`, `queued`, `recovered` = completed after an error; empty = any). Both and the page size select use `resetUrlParams: [page]` (dsl-ui >= 2026.10.22-124).
- The route sends the full `flowId` and `executionId`; the flow column is `truncate`. dsl-ui caps a column at `max-w-xs` (20rem), so at 510px of content the table scrolls horizontally and Status is partly off screen.
- `emptyMessage` comes from the route: "No executions on this page" (page past the end), "No execution matches the filters", "No execution yet: ...".
- A DataTable cell cannot hold a link and a row action cannot navigate. Per-row links live in the row panel (chevron, DataTable `expansion`): **Logs** (this module) and the slot `flow:execution-row-actions`. The panel gets the row as `$ctx.row`; a contribution reads `$ctx.row.executionId` / `flowId` (flow-core `FLOW_EXECUTION_ROW_CONTEXT_FIELDS`). The chart link is contributed by the flow-chart module.
- No "Back to ..." link on any page: the shell shows a breadcrumb.

## Execution logs page

`/executions/:id/logs` (breadcrumb "Logs"), linked from the detail page and the row panel. Route: `GET /executions/:id/logs?step&level&q&page&limit`, built on flow-core `readExecutionLogs`.

- Source: the daemon's daily `logs/YYYY-MM-DD.ndjson`; step lines carry `prefix: "[<executionId>|<stepId>]"`, read from the run's start day to its end day. Unreadable lines are counted in `notice`.
- `page` counts from the end (0 = latest lines); rows in a page are oldest first. Default 100 lines, max 1000.
- `stepOptions` (record steps, then ids such as `__execution`) feeds the step select, which needs an `$if` on it (CompactSelect throws on undefined options while the route loads).
- `recordedOutput`: error, stdout and stderr kept in the record for failed steps; it outlives the daily files.
- The time column is `format: time` (no seconds: a dsl-ui limit).
- Masking: the daemon writes secrets unmasked (`LogMasker` is not wired), so these lines, like `GET /logs`, are served as written.

## Times and table columns

- Timestamps are ISO 8601 (`startedAt`, `completedAt`, `lastStartedAt`, `timing`, `lastRun`), validated by flow-core `requireTimestamp` (an invalid date fails loudly). No server-side label, no "5m" age.
- Views use DataTable `format: datetime`, the formatter of the other modules: `Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })` (viewer locale, no seconds).
- A Badge, StatTile or composed string cannot format a timestamp: the detail page shows start and end as a one-row table (`timing`), the tiles widget shows the last run the same way (`lastRun`).
- Shells older than dsl-ui 122 ignore `format` and show the raw ISO text.
- Durations stay readable text from the backend ("12.3s"): `format: ms` only appends "ms".
- Column options (dsl-ui >= 122): `format`, `badge` (status words), `nowrap` (times, counts, status), `truncate` (names), `mono` (ids, versions), `muted`. `views.test.ts` pins every `*At` column to `format: datetime` in every variant.

## Design variants (A/B)

Views declare alternatives with the dsl-ui `AbTest` node. The widget is four independent experiments (dimensions) stacked in one card, each with its own dock row.

| View                         | id                       | Variants (first = `initial`)                    |
| ---------------------------- | ------------------------ | ----------------------------------------------- |
| `executions-widget.yaml`     | `flow-widget-summary`    | `tiles`, `banner`, `rate`, `big`                |
| `executions-widget.yaml`     | `flow-widget-trend`      | `none`, `bars`, `daily-rate`, `delta`           |
| `executions-widget.yaml`     | `flow-widget-recent`     | `none`, `latest`, `failures`, `active`, `flows` |
| `executions-widget.yaml`     | `flow-widget-actions`    | `link`, `buttons`, `status`, `latest-failure`   |
| `executions-page.yaml`       | `flow-executions-design` | `table`, `filters-first`, `flows-aside`         |
| `execution-detail-page.yaml` | `flow-execution-design`  | `steps-table`, `summary-first`                  |

- Pick one in the dock of a development shell, or force it for one page load with `?ab.<id>=<variant>` (stored in `localStorage` key `ab.<id>`). Production shells and shells with the dock disabled render `initial`.
- Needs a shell with dsl-ui >= 2026.10.19-110; an older shell shows "Unknown component type: AbTest". The manifest declares no `dslLib` range for it (that needs a `src/dsl-components` entry), so app-core still loads the module.
- Widget defaults: `tiles`, `none`, `none`, `link`. Combine with `?ab.flow-widget-summary=banner&ab.flow-widget-trend=bars`.
- Widget data: the `recent` source (`GET /widgets/executions`, flow-core `RunDigest` flattened in `ExecutionWidgetBody.ts`) feeds every dimension; `daemon` (`GET /widgets/daemon`) only `actions=status`. `latest-failure` and `buttons` link to flow-chart pages, which exist only if that module is installed.
- Keep ids and variant keys stable: renaming drops the choice stored in browsers. `views.test.ts` pins them (`EXPECTED`).
- To keep one variant of a widget dimension, replace its `AbTest` node by the chosen `view` (nothing for `none`). To retire an experiment, do the same, delete the other variants, inline the YAML anchors, drop the backend fields no view reads, and update `EXPECTED`.
