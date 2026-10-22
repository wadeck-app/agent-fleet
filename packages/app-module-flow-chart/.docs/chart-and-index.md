# Chart header, sub-step tree, flows index (A/B)

## Chart header and sub-steps

- Header: without a run it reads "Flow structure (no run selected)" (steps as written in the flow file, no status); with a run, "Run <id>" plus its status badge. The legend starts with the same sentence (`ChartMode.ts`).
- Sub-steps are a tree, built by `buildGraphTree` (`flow-core/graph-tree`, browser-safe subpath) from the real parent relation: `parent` in the flow file, or `parent` recorded in the run for injected steps (`substep` edges, child to parent). No other source of parent exists; a step has at most one, and cycles throw.
- Layout rule (`GraphLayout.ts`, both directions): top-level steps are the spine, ordered and placed by dagre (vertical or horizontal). A step with sub-steps owns a block: the step, then its sub-steps stacked below it in dependency order, one indent (40 px) deeper per level, joined by an elbow from the parent's lower left corner. The next spine step starts after the block.
- A chevron and "N sub-steps" on the parent fold its sub-steps; parents with more than 8 start folded. Edges to hidden steps are redrawn on the folded parent. Folding keeps the layout direction.
- Edges: along the spine the usual in/out sides; in a vertical chart a parent with visible sub-steps is left by its left side, and non-neighbour dependencies among sub-steps go around the left side.

## Flows index (A/B)

`flows-page.yaml` declares the AbTest `flow-chart-index-design` (needs dsl-ui >= 2026.10.19-110, set in `manifest.json`). Dock and `?ab.<id>=<variant>` work only in a development shell; a production shell, including the `app-core-cli dev` bundle, shows `initial`.

| Variant key       | What                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `table` (initial) | The table; a row opens the definition chart                          |
| `cards`           | Cards with name, status badge, counts, age; search and health filter |
| `list`            | Search first, dense rows; both chart buttons on every row            |
| `health-board`    | Failing, running, healthy groups with counts; healthy folded         |

Keep one: replace the AbTest by the chosen `view`, resolve the YAML anchors, drop the unused source, update `views.test.ts`. Keep ids and keys stable meanwhile (browsers store the choice).
