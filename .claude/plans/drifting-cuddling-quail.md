# 2026-03-04 — Lego Feedback Implementation Plan

## Context

Following the completion of the 16-test visual regression suite (A1–A4 × S1/S2/S3/S6), the user
provided comprehensive feedback covering: code quality issues, missing scenarios in A5, a new
approach A6 to create (Data2-based), 5 new cross-approach scenarios, unit tests per approach,
and a final antifragility analysis. This plan covers all items from the feedback tracking file
`.claude/plans/2026-03-04_lego-feedback-todo.md`.

Current state:

- Visual tests pass for A1–A5 × S1/S2/S3/S6 (16 tests)
- A5 has only 4 scenarios (S1, S2, S3, S6) — missing 6
- A6 does not exist
- A5 S3Page has a `className=` violation that will fail the no-classname test
- Several code quality issues across A1–A4

---

## Phase 1 — Code quality fixes + A5 className violation (frontend-dev agent)

**Delegate to frontend-dev agent. Run `/check` + unit tests after.**

### 1.1 Fix A5 S3Page className violation (BLOCKING — test will fail)

`packages/web-frontend/src/app/pages/_lego/_5_query-pipeline/S3_FullFeatured/S3Page.tsx`

Currently wraps children in `<div className="flex h-full flex-col gap-4">` directly in the page.

Fix: Create `PipelineContent` wrapper component in the A5 framework:

- **New file**: `packages/web-frontend/src/app/pages/_lego/_5_query-pipeline/_framework/PipelineContent.tsx`
    - Renders `<div className="flex h-full flex-col gap-4">{children}</div>`
- Update S3Page.tsx, S2Page.tsx, S6Page.tsx to use `<PipelineContent>` instead of raw `<div className>`

### 1.2 G1 — Audit and remove `index.ts` files in lego

Glob `packages/web-frontend/src/app/pages/_lego/**/*.ts` for any `index.ts`. Remove them if found.

### 1.3 G2 — Remove one-liner if/return patterns

Grep `packages/web-frontend/src/app/pages/_lego/` for:

- Pattern: `if \(.*\) return` on a single line
- Add braces to all `if` bodies that lack them across A1–A5

### 1.4 A3.a — Verify MutableRefObject in HookDataTable

`packages/web-frontend/src/app/pages/_lego/_3_feature-hooks/_framework/HookDataTable.tsx`

If `MutableRefObject` is still used, replace with `RefObject`. If already `RefObject`, no change needed.

### 1.5 A4.d — Remove null Toolbar from A4 S1Page

`packages/web-frontend/src/app/pages/_lego/_4_context-children/S1_SimpleTable/S1Page.tsx`

Remove any `<DataTable.Toolbar>{null}</DataTable.Toolbar>` if present.

### 1.6 A4.c — Remove className from A4 pages

Grep A4 page files (`_4_context-children/**/*Page.tsx`) for `className=`. Remove all; delegate styling to PageLayout or framework components.

### 1.7 A3.b — Extract column render logic in HookDataTable

`packages/web-frontend/src/app/pages/_lego/_3_feature-hooks/_framework/HookDataTable.tsx`

Extract the inline column render function into a separate `HookColumnRenderer.tsx` helper or local function to reduce complexity.

### 1.8 A2.b — Fix `void fetchProducts()` pattern

`packages/web-frontend/src/app/pages/_lego/_2_context-provider/_framework/`

The `void fetchProducts()` anti-pattern bypasses error handling. Fix by adding `.catch()` or wrapping in try/catch. Document the limitation.

**Verification**: `/check` must pass, all unit tests must pass.

---

## Phase 2 — A5 missing scenarios (frontend-dev agent)

**Delegate to frontend-dev agent. A5 needs 6 more scenarios.**

Reference: A1 implementations at `packages/web-frontend/src/app/pages/_lego/_1_widget-isolated/`

For each scenario, create the A5 equivalent using `PipelineDataTable` + pipeline modifiers:

| Scenario                    | Folder                               | A1 reference                                            |
| --------------------------- | ------------------------------------ | ------------------------------------------------------- |
| S4 — Grid popup             | `S4_GridPopup/S4Page.tsx`            | `_1_widget-isolated/S4_GridPopup/S4Page.tsx`            |
| S5 — Carousel               | `S5_Carousel/S5Page.tsx`             | `_1_widget-isolated/S5_Carousel/S5Page.tsx`             |
| S7 — Master-detail nav      | `S7_MasterDetailNav/S7Page.tsx`      | `_1_widget-isolated/S7_MasterDetailNav/S7Page.tsx`      |
| S9 — Two independent tables | `S9_TwoIndependentTables/S9Page.tsx` | `_1_widget-isolated/S9_TwoIndependentTables/S9Page.tsx` |
| S10 — Inline editing        | `S10_InlineEditing/S10Page.tsx`      | `_1_widget-isolated/S10_InlineEditing/S10Page.tsx`      |
| S11 — Three edit modes      | `S11_ThreeEditModes/S11Page.tsx`     | `_1_widget-isolated/S11_ThreeEditModes/S11Page.tsx`     |

All under `packages/web-frontend/src/app/pages/_lego/_5_query-pipeline/`.

Add routes in `packages/web-frontend/src/app/App.tsx` for `/lego/5/s4`, `/lego/5/s5`, `/lego/5/s7`, `/lego/5/s9`, `/lego/5/s10`, `/lego/5/s11`.

**Zero className in page files** — use `PipelineContent` or new pipeline framework wrappers.

**Verification**: `/check` must pass.

---

## Phase 3 — Create A6 (Data2-based approach) (frontend-dev agent)

**New approach: `_6_data2-based/`**

Architecture: Uses `Data2` + `Table2` + `hooks2` family. No eventBus, no context/provider, no pipeline.
Independent feature hooks compose the query; `Data2` fetches and injects data via render props.

Key dependencies:

- `Data2`: `packages/web-frontend/src/framework/components2/data/Data2.tsx`
- `Table2`: `packages/web-frontend/src/framework/components2/table/Table2.tsx`
- Hooks: `packages/web-frontend/src/framework/hooks2/data/usePagination2.ts`, `useSorting2.ts`, `useSimpleSearch.ts`, etc.

### 3.1 Create framework scaffolding

New folder: `packages/web-frontend/src/app/pages/_lego/_6_data2-based/_framework/`

- `PageLayout.tsx` — reuse or copy from A5 framework
- `Data2Table.tsx` — wrapper component composing Data2 + Table2 with standard features

Pattern for each page: page creates hooks (usePagination2, useSorting2, etc.) and passes contracts to `<Data2>`. Children render via render prop or cloneElement.

### 3.2 Implement all 10 scenarios

Reference A1 for feature requirements. Use Data2 pattern throughout.

| Scenario                    | Notes                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| S1 — Simple table           | Basic Data2 + Table2, no features                                      |
| S2 — Table with pagination  | Add `usePagination2`                                                   |
| S3 — Full featured          | Add usePagination2 + useSorting2 + useSimpleSearch + column visibility |
| S4 — Grid popup             | Grid layout variant                                                    |
| S5 — Carousel               | Carousel layout                                                        |
| S6 — Item detail            | Split layout, Data2 for list + single-item fetch for detail            |
| S7 — Master-detail nav      | Navigation pattern                                                     |
| S9 — Two independent tables | Two independent Data2 instances                                        |
| S10 — Inline editing        | Mutation via MutationContract                                          |
| S11 — Three edit modes      | Dialog / inline / form-below                                           |

### 3.3 Add routes

`packages/web-frontend/src/app/App.tsx` — add `/lego/6/s1` through `/lego/6/s11`.

**Verification**: `/check` must pass.

---

## Phase 4 — New cross-approach scenarios (frontend-dev agents, parallel)

**5 new scenarios to implement across ALL 6 approaches.**

### S_BUS — EventBus exploitation (A1.e)

- Table + selected item panel below
- Click row → load item, refresh on re-click
- Keyboard arrows to navigate rows
- URL contains selected item id (`?id=xxx`)
- Implement for all approaches (A1 eventBus natural fit; A2–A6 via prop/state)

### S_2TABLES — Two independent tables (A2.e)

- Same page, two tables, different item types (e.g., Products + Books)
- Tables are fully independent (separate state/queries)
- Implement for all approaches

### S_EDIT — Three edit modes fork (A4.b)

- Fork of SimpleTable with edit capability via (a) dialog, (b) inline cell editing, (c) form below
- Implement for all approaches

### S_FORK_FEAT — Feature fork (A2.g)

- Fork of an existing page adding a new feature (e.g., multi-level sorting or side-by-side item comparison)
- Implement for all approaches

### S_WS — WebSocket real-time (A1.f)

- Real-time table with WebSocket updates (items added/updated/removed live)
- Requires backend WebSocket endpoint
- Implement for all approaches — goal is to observe architectural impact

Folder naming: `S_BUS/`, `S_2TABLES/`, `S_EDIT/`, `S_FORK_FEAT/`, `S_WS/` under each approach directory.
Routes: `/lego/{1-6}/s_bus`, `/lego/{1-6}/s_2tables`, etc.

**Delegation strategy**: Run 2–3 frontend-dev agents in parallel, each handling a subset of approaches for a given scenario.

**Verification**: `/check` must pass per agent.

---

## Phase 5 — Expand visual tests to all scenarios (frontend-dev agent)

`packages/e2e-web/test-lego-visual/lego.cross-approach.visual.ts`

Extend `APPROACHES` to include A6. Extend `SCENARIOS` to cover all scenarios including S4, S5, S7, S9, S10, S11, S_BUS, S_2TABLES, S_EDIT, S_FORK_FEAT, S_WS (once implemented).

Some scenarios require custom `waitFor` logic (e.g., S6 has a detail panel — wait for split layout, not just first tbody row).

**Steps**:

1. Establish A1 baselines: `npm run test:lego-visual:update-baseline`
2. Run full suite: `npm run test:lego-visual`
3. Fix any visual regressions until all tests pass

---

## Phase 6 — Unit tests per approach (one frontend-dev agent per approach)

**T1 — Unit tests for each approach, placed next to implementation.**

Per approach, test:

- Core data hook/service integration (mock service, verify query params)
- Feature composition (pagination changes trigger refetch)
- Timing (loading state set/unset correctly)
- Error handling (service throws → error state shown)
- Concurrency (rapid state changes → only last result used)

Key files to test:

| Approach | Primary test target                              |
| -------- | ------------------------------------------------ |
| A1       | `WidgetDataTable.tsx` + `useWidgetQuery.ts`      |
| A2       | `ProductDomainContext.tsx` + `ViewDataTable.tsx` |
| A3       | `HookDataTable.tsx` + each feature hook          |
| A4       | `DataTableContext.ts` + `DataTable.tsx`          |
| A5       | `usePipeline.ts` + `PipelineContext.tsx`         |
| A6       | Data2 composition in `Data2Table.tsx`            |

Test files placed next to implementation: e.g., `WidgetDataTable.test.tsx`.

---

## Phase 7 — Documentation items (frontend-dev agent)

Add JSDoc / inline documentation to the following files:

| Item | File                                                | Content                                                                                            |
| ---- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A1.b | `_1_widget-isolated/_framework/WidgetDataTable.tsx` | "Immutable lego brick" strategy: features pre-determined in widget, extension via slots + eventBus |
| A1.h | Same                                                | Adding new display feature requires modifying all WidgetXxx components                             |
| A2.a | `_2_context-provider/_framework/DomainContext.tsx`  | DomainContext tightly coupled to item list; limits for single-item or multi-source pages           |
| A2.c | `_2_context-provider/_framework/ViewDataTable.tsx`  | `actions` in useMemo return void — no user feedback/toasts                                         |
| A2.d | Same                                                | A2 adds complexity layer vs A1; provider becomes a factory when features grow                      |
| A2.f | `_2_context-provider/` page or layout               | Provider positioned above page — why: context must wrap all consumers                              |
| A2.h | `_2_context-provider/_framework/`                   | Tension: simple views (pro) vs provider factory (con)                                              |
| A3.c | `_3_feature-hooks/_framework/HookDataTable.tsx`     | Same limitation as A1.h: display features hard-coded in HookXxx                                    |
| A3.d | Analysis doc                                        | "Verbose pages" is a feature, not a bug — explicit composition is readable                         |
| A4.a | `_4_context-children/_framework/DataTable.tsx`      | New feature requires modifying DataTable base; frozen evolution path                               |
| A4.e | Analysis doc                                        | Pages very verbose (cons): each slot must be explicitly composed                                   |

---

## Phase 8 — Multi-axis analysis (7 sub-agents in parallel, model: claude-haiku-4-5-20251001)

Once all phases complete, launch 7 independent Explore sub-agents simultaneously.
Each reads all 6 approaches and produces its section of `_lego/ANALYSIS.md`.

**IMPORTANT**: All agents use model `claude-haiku-4-5-20251001` (cost efficiency for analysis).

### Agent 1 — Antifragilité

Analyze the git history (`git log --all --oneline`) and each approach's source code to answer:

- When new scenarios were added (S4–S11, S_BUS, S_WS, etc.), how much did each approach need to change?
- When A6 was created from scratch, how much did existing code need to adapt?
- Does the architecture gain from disorder (new scenarios easy to add), stay neutral, or break?
- Focus on: did adding a new scenario require modifying framework files, or only adding a new page?

Evidence: compare `_framework/` file change frequency via git log. Open vs closed architecture.

### Agent 2 — Testabilité

For each approach's unit test files (A1–A6), analyze:

- How many mocks are needed to test core behavior? (fewer = better)
- Can tests control time/concurrency? (fake timers, abort signal testing, sequential state checks)
- How complete is the coverage of: loading state, error state, pagination side-effects, concurrent requests?
- Does the architecture naturally lend itself to isolated unit testing (pure functions, injected deps)?

Evidence: read the test files and count mock setup lines vs assertion lines.

### Agent 3 — Simplicité des pages

For each approach, read 3 representative page files (S1, S3, S_WS) and measure:

- Line count of each page
- Number of concepts a developer must understand to write a new page (hooks, context, pipeline, etc.)
- Whether the page is "just configuration" vs "imperative logic"
- Whether a junior developer could write a new page by copy-pasting from an existing one

### Agent 4 — Cohérence

For each approach, analyze how uniform the pattern is across pages:

- Do all pages follow the exact same structure/idiom? Or do some pages deviate?
- Are framework components reused as-is, or customized per-page?
- Is there a "blessed path" that all pages follow, or multiple valid patterns?

Evidence: compare page files across the same approach (S1 vs S3 vs S_WS for each approach).

### Agent 5 — New feature extensibility

For each approach, analyze what it takes to add a brand-new feature (e.g., row click → detail, or export button):

- Does the framework component need to be modified? (bad — closed)
- Can the feature be added at the page level only? (good — open)
- Can the feature be added as a composable hook/modifier? (best — antifragile)

Evidence: look at how S_WS (WebSocket) was implemented per approach — did it require framework changes?

### Agent 6 — Maintenabilité

For each approach, evaluate:

- Code quality: naming clarity, single responsibility, no god components
- Pattern stability: are there anti-patterns that compound over time (prop drilling, void promises, etc.)?
- Refactoring cost: if a new developer joins and needs to change the pagination behavior globally, how many files change?

### Agent 7 — Error avoidance (LLM agent friendliness)

A critical dimension: when an LLM agent (like Claude Code) writes a new page or adds a feature, how likely is it to make mistakes?

- Is the pattern self-documenting / hard to misuse?
- Is there a single obvious way to do things, or multiple competing patterns?
- Does the architecture protect against style drift (className leaking into pages, void callbacks, etc.)?
- Evidence: look at the actual errors that occurred during implementation (see git history commit messages, and ANALYSIS.md if it exists)

---

**Compilation**: After all 7 agents report, compile results into `_lego/ANALYSIS.md` with:

- One section per analysis axis with a comparative table (A1–A6)
- A final summary table: overall score per approach (1–5 per axis)
- Recommended approach for each use case (LLM agent, junior dev, senior dev, testability-first)

---

## Execution order

```
Phase 1 — frontend-dev agent (1)
  → Code quality + A5 className fix + /check + unit tests

Phase 2 — frontend-dev agent (1)
  → A5 missing 6 scenarios + /check

Phase 3 — frontend-dev agent (1)
  → A6 creation (all 10 scenarios) + /check

Phase 4 — frontend-dev agents (2–3 in parallel)
  → New cross-approach scenarios (S_BUS, S_2TABLES, S_EDIT, S_FORK_FEAT, S_WS) + /check

Phase 5 — frontend-dev agent (1)
  → Expand visual tests + update baselines + run full suite

Phase 6 — frontend-dev agents (1 per approach, 6 in parallel)
  → Unit tests per approach

Phase 7 — frontend-dev agent (1)
  → Documentation items

Phase 8 — 3 Explore sub-agents in parallel
  → Antifragility analysis → ANALYSIS.md
```

---

## Critical files

| File                                                      | Phase | Action                                    |
| --------------------------------------------------------- | ----- | ----------------------------------------- |
| `_5_query-pipeline/S3_FullFeatured/S3Page.tsx`            | 1     | Remove className div, use PipelineContent |
| `_5_query-pipeline/_framework/PipelineContent.tsx`        | 1     | Create new                                |
| `_3_feature-hooks/_framework/HookDataTable.tsx`           | 1     | Verify RefObject, extract column renderer |
| `_4_context-children/S1_SimpleTable/S1Page.tsx`           | 1     | Remove null Toolbar if present            |
| `_2_context-provider/_framework/` (fetchProducts)         | 1     | Fix void pattern                          |
| `_5_query-pipeline/S4_GridPopup/` → `S11_ThreeEditModes/` | 2     | Create (6 files)                          |
| `_6_data2-based/` (entire approach)                       | 3     | Create from scratch                       |
| `App.tsx`                                                 | 2+3+4 | Add routes per phase                      |
| `test-lego-visual/lego.cross-approach.visual.ts`          | 5     | Expand scenarios + add A6                 |
| `_lego/__tests__/no-classname-in-pages.test.ts`           | 1     | Verify covers A5/A6 (no exclusions)       |
