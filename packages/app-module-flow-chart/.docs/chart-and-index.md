# Run path, step I/O, chart header, sub-step tree, flows index

## Run path (flow-core `RunPath.ts`, `RunGraphAnnotation.ts`)

The record keeps per step: status, start of the latest attempt, completion, attempt count, error. It does not keep which dependency released a step or the value of a `when`.

| Shown                                          | Basis                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Number on a node (1, 2, ...)                   | Recorded: order of each step's latest start (a step run twice is numbered by its last run)                      |
| Step ran / running / waiting                   | Recorded                                                                                                        |
| Skipped                                        | Recorded that the step completed without starting; the cause (`when`, branch) is inferred                       |
| Not reached / probably skipped in a failed run | Inferred from the failed or missing dependency, or an unmet `when`                                              |
| Attempts kind (retry, loop passes, relaunch)   | Inferred from the flow definition; only the start count is recorded                                             |
| Heavy vs faded edge                            | Inferred: both ends started and the source finished before the target started (loop: target ran more than once) |
| "recorded order" edge                          | Recorded start order, for steps the flow file no longer declares                                                |

## Step panel: inputs and outputs (`StepIO.ts`)

- Recorded since 2026-10-24 (`StepState.io`, see `.claude/plans/2026-10-24_step-io-recording.md`): resolved inputs (flow inputs read, rendered env, model prompt), the output map, and stdout/stderr tails of every step, capped (4096 per value, 32768 per step, 1 MiB per run) and masked. A cut value shows `truncated, N chars`. Records written before say "not recorded for this run" and the panel falls back to the declaration. Failed steps also keep the legacy full `stdout`/`stderr`, error, meta and relaunch feedback.
- Inputs show the declaration (and, when recorded, the resolved value next to it): references (`${{ ... }}`) of prompts and scripts (never their text), values of env / sub-flow inputs (200 chars max).
- Data-flow links ("Uses output of" / "Used by") come from `steps.<id>.outputs` references in prompt, script, env, inputs, `when`, `context.previousOutputs` and `session.continue`; names select the node.
- Served text: stdout, stderr, errors and relaunch feedback are ANSI-stripped before the 2000-char cut, so "last 2000 of N characters" counts the stripped text. Nothing else is hidden: secrets are masked by the daemon at write time (declared ones only), older records may contain some. Details and grep recipe: [app-module-flow `.docs/served-text.md`](../../app-module-flow/.docs/served-text.md).
- "Logs of this step" opens `/modules/flow/executions/<id>/logs?step=<stepId>` (`executionStepLogsPath`).

## Chart header and sub-steps

- Header: without a run it reads "Flow structure (no run selected)" (steps as written in the flow file, no status); with a run, "Run <id>" plus its status badge. The legend starts with the same sentence (`ChartMode.ts`).
- Sub-steps are a tree, built by `buildGraphTree` (`flow-core/graph-tree`, browser-safe subpath) from the real parent relation: `parent` in the flow file, or `parent` recorded in the run for injected steps (`substep` edges, child to parent). No other source of parent exists; a step has at most one, and cycles throw.
- Layout rule (`GraphLayout.ts`, both directions): top-level steps are the spine, ordered and placed by dagre (vertical or horizontal). A step with sub-steps owns a block: the step, then its sub-steps stacked below it in dependency order, one indent (40 px) deeper per level, joined by an elbow from the parent's lower left corner. The next spine step starts after the block.
- A chevron and "N sub-steps" on the parent fold its sub-steps; parents with more than 8 start folded. Edges to hidden steps are redrawn on the folded parent. Folding keeps the layout direction.
- Edges: along the spine the usual in/out sides; in a vertical chart a parent with visible sub-steps is left by its left side, and non-neighbour dependencies among sub-steps go around the left side.

## Flows index

`flows-page.yaml` is a plain page (the A/B tests `flow-chart-index-design` and `flow-chart-index-filters` were retired; the choice stored in browsers is ignored): header, `SearchBar ?q=` + four `ButtonLink` health chips (Any, Failing, Running, Healthy, with counts), table, bottom row with `Pagination` and `PageSizeSelect`. Look of the queue History page; every control has `resetUrlParams: [page]` (dsl-ui >= 2026.10.22-124).

Click targets (a cell cannot hold a link, a row action cannot navigate): a row click opens the flow chart; the chevron opens a row panel (`expansion`) with `ButtonLink` "Open chart" and "Latest run chart". Their paths are row fields built by the route from flow-core `chartPathOfFlow` / `chartPathOfExecution`.

`GET /flows` also sends `emptyMessage` ("No flows on this page" / "No flow matches the filters" / "No flow has run yet: ...") and `chips`. Chips are four named objects (`any`, `failing`, `running`, `healthy`) with `label` ("Failing (12)", counts follow `q` only), `to` (index page keeping `q` and the page size, no page) and `variant` (`primary` when active): the DSL has no URL-bound toggle, no conditional and cannot repeat a node. `health=any` or empty means no filter.

Limits: at 800 px the table scrolls sideways (same as the executions page) and chip labels wrap; a chip click reloads the page (`ButtonLink` is a router link, the page size is kept only because the route echoes it).

## Step panel (A/B)

Cause of the old overflow (measured: 1132 px panel in a 781 px frame at 1280x800, header scrolled away): the cap was `100vh`, not the frame (`DETAILS_STICKY_CLASS`), and the header was inside the scrolling box. Now every layout caps the panel at the frame (`min(100%, 100vh - 1rem)` beside the chart, 70vh when stacked under it below 1024 px), keeps the header (name, status, Close) fixed and scrolls the body. Opening it moves the focus to the panel (scrolled into view when stacked below the fold); Escape inside closes it; stdout/stderr/error have a Copy button (a refused copy shows why).

Two independent tests, declared in code (`StepPanelExperiment.ts`, dsl-ui `useAbTest` + `useRegisterAbTests`; the DSL cannot express a React layout). They apply only when the shell dock is on (dev shell); otherwise, or with a stored choice but no dock, the hook returns `initial`. Force one with `?ab.<id>=<variant>`.

| Test id                         | Variants (first = initial)                 |
| ------------------------------- | ------------------------------------------ |
| `flow-chart-step-panel`         | `overlay`, `drawer`, `tabs`, `accordion`   |
| `flow-chart-step-panel-density` | `comfortable`, `compact` (text, block cap) |

| Variant     | Idea                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `overlay`   | Floating panel over the right of the chart, header fixed, body scrolls                             |
| `drawer`    | Docked right over the full chart height, resizable (drag or arrow keys, 280-640 px); chart narrows |
| `tabs`      | Summary / Error / Inputs / Links / Outputs, one at a time; opens on Error for a failed step        |
| `accordion` | Collapsible sections, only Error open (Summary when none)                                          |

Not built: a bottom dock (steals height from a 420 px chart; the drawer covers the resizable case). Needs a shell dsl-ui that exports `useAbTest`, `useRegisterAbTests` and `useAbExperiments`; `manifest.json` declares `>=2026.10.24-153` for dsl-ui and dsl-renderer.

Keep one: fix `layout` / `density` in `useStepPanelExperiment`, delete `StepPanelExperiment.ts`, the unused layouts (`StepPanelTabs`, `StepPanelAccordion`, `DrawerResizeHandle`, the drawer branch of `StepPanelDock`) and their tests.
