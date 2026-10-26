# Pages, columns, execution logs, design variants

## Executions page

- Filters are URL-bound controls: `SearchBar` `?flow=` (route param `flowContains`, case-insensitive substring; `flow` stays exact) and `CompactSelect` `?status=` (`completed`, `failed`, `running`, `queued`, `recovered` = completed after an error; empty = any). Both and the page size select use `resetUrlParams: [page]` (dsl-ui >= 2026.10.22-124).
- The route sends the full `flowId` and `executionId`; the flow column is `truncate`. dsl-ui caps a column at `max-w-xs` (20rem), so at 510px of content the table scrolls horizontally and Status is partly off screen.
- `emptyMessage` comes from the route: "No executions on this page" (page past the end), "No execution matches the filters", "No execution yet: ...".
- Rows are not clickable (no `navigateTo`). The first column is an icon-only router link (`type: link`, `icon: eye`, `position: start`, label "Open details", dsl-ui >= 2026.10.24-153): a real `<a>` right after the expansion chevron, `{executionId}` filled from the row; `views.test.ts` pins that the template equals flow-core `executionPagePath`. The chevron opens a panel (DataTable `expansion`), left to right: slot `flow:execution-row-links` (flow-chart: **Flow definition**), **Logs**, slot `flow:execution-row-actions` (flow-chart: **Flow chart**). The panel gets the row as `$ctx.row`; a contribution reads `$ctx.row.executionId` / `flowId` (flow-core `FLOW_EXECUTION_ROW_CONTEXT_FIELDS`).
- No "Back to ..." link on any page: the shell shows a breadcrumb.

## Execution detail: inputs / outputs

`GET /executions/:id` also sends `ioText`: per started step, a header line then flow-core `renderStepIoLines` (the `flow show <id> --io` lines), built from the served record (ANSI stripped, values masked when recorded). The page shows it in a `Collapsible` "Inputs / outputs" (closed by default). The DSL has no repeater, so it is one text, not one section per step. A record without `io` says "not recorded for this run".

## Execution detail: buttons and retries

- Header buttons, left to right: slot `flow:execution-links` (flow-chart: **Flow definition**), **Logs** (this module), slot `flow:execution-actions` (flow-chart: **Flow chart**). A slot renders where the view puts it, so a contribution can precede an own button only through its own slot.
- Steps table column **Retries** = `retryLabel`, a badge of attempts - 1 (0 included). Texts and colours are flow-core `RETRY_BADGE_VARIANTS` (pinned by `views.test.ts`): `0 retry` green; `1 retry`, `2 retries`, `3+ retries` orange; `no retry left` red; `retry policy unknown` and `retries unknown` grey; `-` (plain) for a step that did not start.
- Steps table row panel (DataTable `expansionCondition: expandable` + `expansion` = nested DataTable on `$ctx.row.attemptRows`): only for a step with 2+ attempts or an unknown cost; one line per attempt (n, origin, duration, own cost or `unknown` + reason, tokens, turns, tools, end reason; a non-model step shows `-` cost). An unknown cost cell reads `unknown - see attempts`. Built by `StepAttemptRows.ts` from flow-core `attemptHistory`.
- `no retry left` = the step is `failed` and retries (attempts - 1) >= budget, where budget = `retry.maxAttempts` + `onFailure.maxIterations` (default 3) when `onFailure.goto` is set (the scheduler never resets the retry count and adds the loop iterations on top). The budget is read from the run's flow file (`readRetryPolicies`); a deleted or invalid file, or a step the file does not declare, gives `retry policy unknown`, never red.

## Execution logs page

`/executions/:id/logs` (breadcrumb "Logs"), linked from the detail page and the row panel. Route: `GET /executions/:id/logs?step&level&q&page&limit`, built on flow-core `readExecutionLogs`.

- Source: the daemon's daily `logs/YYYY-MM-DD.ndjson`; step lines carry `prefix: "[<executionId>|<stepId>]"`, read from the run's start day to its end day. Unreadable lines are counted in `notice`.
- `page` counts from the end (0 = latest lines); rows in a page are oldest first. Default 100 lines, max 1000.
- `stepOptions` (record steps, then ids such as `__execution`) feeds the step select, which needs an `$if` on it (CompactSelect throws on undefined options while the route loads).
- `recordedOutput`: error, stdout and stderr kept in the record for failed steps; it outlives the daily files.
- The time column is `format: time` (no seconds: a dsl-ui limit).
- Masking: these lines, like `GET /logs`, are served as stored (ANSI-stripped only). The daemon masks declared secrets at write time; older lines may hold secrets (see served-text.md).

### Log view experiments (`flow-logs-*`)

Problem: a line named its step only as a text prefix, with no order, no attempt, no sub-step nesting; the steps' start/complete lines sat under `__execution`, away from the step.

Route additions (`LogTimeline`, flow-core `attemptOf`): per line `stepOrder` (1-based, by record `startedAt`), `stepDepth`, `attempt`/`attempts` (count of `Step <id> started executing` events up to the line), `offsetMs` (from run start), `deltaMs` (previous line of the page), `subjectStepId` (a run event "Step X started|completed|failed|not run" belongs to X: its order, depth and attempt); top level `steps` (tree + execution order: status, attempts, `lineCount` over the whole run for the level/text filters, time bar offsets) and `runDurationMs`. Declared sub-steps (`parent:` in the flow file) are not in the record: nesting is read from the run's recorded definition (`FlowQueryService.declaredParents`); when it cannot be read the `notice` says so and only recorded parents (injected steps) nest.

`flow-logs-design` (`execution-logs-page.yaml`, AbTest node): `stream` (initial, `flow:LogStream`) or `table` (the previous DataTable). The stream declares five more rows with `useAbTest` + `useRegisterAbTests` (`LogStreamChoices.ts`; ids in `src/commons/LogStreamAbIds.ts`), shown in the dock only while `stream` is chosen. Outside a dev shell (`AbExperiments` off or absent) the defaults apply and stored choices are ignored.

| Id                     | Options (first = default is `LOG_STREAM_DEFAULTS`, not the first)                                                                                                                   | Default       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `flow-logs-identity`   | `plain`, `badge` (#order + name), `tree` (badge, indent, try n/m), `stripe`                                                                                                         | `tree`        |
| `flow-logs-grouping`   | `flat`, `step`, `attempt` (collapsible sections, execution order)                                                                                                                   | `flat`        |
| `flow-logs-navigation` | `none`, `chips` (sticky step + level chips, click filters via `?step=`/`?level=`), `rail` (sticky index with time bars, click scrolls, or filters when the step is not on the page) | `chips`       |
| `flow-logs-time`       | `absolute` (clock with ms), `offset` (+12.3s), `delta`                                                                                                                              | `offset`      |
| `flow-logs-density`    | `comfortable`, `compact`, `folded` (3+ quiet info lines of one step fold)                                                                                                           | `comfortable` |

Force one for a page load with `?ab.flow-logs-identity=badge`. Limits: grouping, deltas and folds apply to the 100-line page only; the step filter matches `stepId`, so it hides the run events about that step (they carry `__execution`).

## Times and table columns

- Timestamps are ISO 8601 (`startedAt`, `completedAt`, `lastStartedAt`, `timing`), validated by flow-core `requireTimestamp` (an invalid date fails loudly). No server-side label, no "5m" age.
- Views use DataTable `format: datetime`, the formatter of the other modules: `Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })` (viewer locale, no seconds).
- A Badge, StatTile or composed string cannot format a timestamp: the detail page shows start and end as a one-row table (`timing`); the widget shows the start of each latest run in a `datetime` column.
- Shells older than dsl-ui 122 ignore `format` and show the raw ISO text.
- Durations stay readable text from the backend ("12.3s"): `format: ms` only appends "ms".
- Column options (dsl-ui >= 122): `format`, `badge` (status words), `nowrap` (times, counts, status), `truncate` (names), `mono` (ids, versions), `muted`. `views.test.ts` pins every `*At` column to `format: datetime` in every variant.

## Designs and the dashboard widget

Only the logs page has A/B experiments (above). `views.test.ts` asserts the executions page (`table`), the detail page (`steps-table`) and the widget hold no `AbTest`.

Widget (`executions-widget.yaml`), one source `GET /widgets/executions` (flow-core `RunDigest`, served as is: `total`, `running`, `failed`, `daily`, `latest`):

- Three tiles Running / Failed / Total on one row (a StatTile has no size prop: the height saving is the single row).
- Daily bars: completed and failed runs of the last 7 days (`daily`, counted by flow-core).
- Latest 5 runs: status badge, full flow name, start time (`datetime` column). The name column has `truncate` and no width, status and time are `nowrap`.
- Buttons Runs / Workers / Charts, in `FLOW_ACTION_BUTTON_STYLE`. Charts leads to a flow-chart page, which exists only if that module is installed.
