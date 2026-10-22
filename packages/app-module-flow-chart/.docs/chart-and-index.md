# Run path, step I/O, chart header, sub-step tree, flows index (A/B)

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

- Not recorded: resolved inputs and step outputs. Only failed steps keep stdout/stderr (last 2000 chars), plus error, meta (exit code, session id, tokens, cost) and relaunch feedback. The panel says so.
- Inputs show the declaration: references (`${{ ... }}`) of prompts and scripts (never their text), values of env / sub-flow inputs (200 chars max).
- Data-flow links ("Uses output of" / "Used by") come from `steps.<id>.outputs` references in prompt, script, env, inputs, `when`, `context.previousOutputs` and `session.continue`; names select the node.
- Secrets: the record is NOT masked at write time (`LogMasker` is not wired into the daemon). `SecretRedaction.ts` hides secret-named values and `KEY=value` / bearer / token patterns in what this module adds; it is a safety net, not a guarantee.
- "Logs of this step" opens `/modules/flow/executions/<id>/logs?step=<stepId>` (`executionStepLogsPath`).

## Chart header and sub-steps

- Header: without a run it reads "Flow structure (no run selected)" (steps as written in the flow file, no status); with a run, "Run <id>" plus its status badge. The legend starts with the same sentence (`ChartMode.ts`).
- Sub-steps are a tree, built by `buildGraphTree` (`flow-core/graph-tree`, browser-safe subpath) from the real parent relation: `parent` in the flow file, or `parent` recorded in the run for injected steps (`substep` edges, child to parent). No other source of parent exists; a step has at most one, and cycles throw.
- Layout rule (`GraphLayout.ts`, both directions): top-level steps are the spine, ordered and placed by dagre (vertical or horizontal). A step with sub-steps owns a block: the step, then its sub-steps stacked below it in dependency order, one indent (40 px) deeper per level, joined by an elbow from the parent's lower left corner. The next spine step starts after the block.
- A chevron and "N sub-steps" on the parent fold its sub-steps; parents with more than 8 start folded. Edges to hidden steps are redrawn on the folded parent. Folding keeps the layout direction.
- Edges: along the spine the usual in/out sides; in a vertical chart a parent with visible sub-steps is left by its left side, and non-neighbour dependencies among sub-steps go around the left side.

## Flows index (A/B)

`flows-page.yaml` declares the AbTest `flow-chart-index-design` (the viewing shell needs dsl-ui >= 2026.10.19-110; `manifest.json` keeps `>=2026.10.3-0` on purpose: app-core checks the range against the server's build-info.json, which can be older than the shell, and refuses the whole module then). Dock and `?ab.<id>=<variant>` work only in a development shell; a production shell, including the `app-core-cli dev` bundle, shows `initial`.

| Variant key       | What                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `table` (initial) | The table; a row opens the definition chart                          |
| `cards`           | Cards with name, status badge, counts, age; search and health filter |
| `list`            | Search first, dense rows; both chart buttons on every row            |
| `health-board`    | Failing, running, healthy groups with counts; healthy folded         |

Keep one: replace the AbTest by the chosen `view`, resolve the YAML anchors, drop the unused source, update `views.test.ts`. Keep ids and keys stable meanwhile (browsers store the choice).
