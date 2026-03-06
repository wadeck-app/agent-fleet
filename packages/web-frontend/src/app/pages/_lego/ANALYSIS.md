# Lego Architecture — Multi-Axis Analysis

> Generated 2026-03-06 by 7 independent Haiku sub-agents analyzing A1–A6 across 7 dimensions.
> Each approach implements the same 15 scenarios using a different architectural pattern.

---

## Approaches Under Analysis

| ID  | Name             | Core pattern                                          |
| --- | ---------------- | ----------------------------------------------------- |
| A1  | widget-isolated  | Self-contained widgets with feature array + event bus |
| A2  | context-provider | Domain context provider + view components             |
| A3  | feature-hooks    | Composable feature hooks passed to a data table       |
| A4  | context-children | Compound component pattern (DataTable.\* slots)       |
| A5  | query-pipeline   | Query-modifier pipeline (pure function transforms)    |
| A6  | data2-based      | Data2 render-prop orchestrator + Table2 + hooks2      |

---

## Axis 1 — Antifragilite

_How well does each approach absorb new scenarios without requiring framework changes?_

| Approach | Framework churn (commits) | New scenario = new page only?         | Architecture type           | Score (1-5) |
| -------- | ------------------------- | ------------------------------------- | --------------------------- | ----------- |
| A1       | 3                         | Mostly yes; S_WS uses shared hooks    | Widget-isolated + event bus | 4           |
| A2       | 4                         | Yes, with provider wrapper            | Context-based domain view   | 4           |
| A3       | 5                         | Yes, feature hooks are stable         | Feature-hook composition    | 4           |
| A4       | 4                         | Yes, children context is lean         | Context-children pattern    | 4           |
| A5       | 1                         | Yes, 100% page-only                   | Query-modifier pipeline     | 5           |
| A6       | 2                         | Mostly yes; minor post-launch adapter | Data2-based adapter         | 4           |

### Key Findings

All six approaches demonstrate strong antifragilite patterns, consistently requiring minimal framework
modifications when adding new scenarios. Scenarios are nearly always added as page-only implementations
that compose existing framework exports. **A5 (Query-Pipeline) stands out with perfect antifragilite**:
a single commit created all 15 scenarios and framework in one pass, and no framework changes were needed
afterward.

The churn metric reflects architectural philosophy rather than brittleness. A1-A4 had multiple
refinement commits during the experimental phase, not caused by scenario addition. A5's single-commit
genesis and A6's post-launch `adaptCol` addition both prove that new scenarios never forced framework
refactoring.

S_WS (WebSocket) exemplifies open architecture: in all approaches, the scenario added
`useProductsWebSocket` in `_shared/api/`, not inside any `_framework/` folder. Zero framework
modifications despite introducing a fundamentally new data source.

### Evidence

- A1 framework: 12 files; A2: 13; A3: 15 (inc. 7 feature hooks); A4: 7; A5: 16; A6: 7
- S_FORK_FEAT across all approaches: imports only existing framework exports, zero framework modifications
- A5: `git log --oneline -- _5_query-pipeline/_framework/` = 1 commit (initial creation); no follow-up churn
- A6 post-launch: only `adaptCol.ts` added (pure adapter, no modification to Data2/Table2)

---

## Axis 2 — Testabilite

_How easy is it to write complete, isolated unit tests for each approach?_

| Approach | vi.mock count | vi.fn count | Covers loading?              | Covers error?  | Covers concurrency?          | Score (1-5) |
| -------- | ------------- | ----------- | ---------------------------- | -------------- | ---------------------------- | ----------- |
| A1       | 1             | 1           | Yes (deferred)               | Yes            | No                           | 3           |
| A2       | 1             | 6           | Yes                          | Yes (recovery) | No                           | 2           |
| A3       | 0             | 1           | Yes (deferred)               | Yes            | No                           | 4           |
| A4       | 0             | 1           | Yes (deferred + transitions) | Yes            | Partial (deferred isolation) | 4           |
| A5       | 0             | 1           | Yes (implicit)               | Yes            | No                           | 4           |
| A6       | 0             | 1           | Yes (deferred)               | Yes            | No                           | 4           |

### Key Findings

**A2 Context Provider is the hardest to test** (Score 2). Testing requires mocking the entire
`ProductsService` module via `vi.mock()` with 6 separate `vi.fn()` calls. Even when testing a single
hook, all service methods must be mocked. Test setup balloons; the provider test runs 10 assertions
but requires 6 mocks and hoisted initialization to avoid "Cannot access before initialization" errors.

**A4, A5, and A6 are most testable** (Score 4). All three avoid module-level mocking entirely, using
direct mock functions passed via props or service injection. A4 stands out for testing loading state
transitions in detail using deferred promises, verifying both "loading" to "not-loading" state changes
and catching potential state management regressions. A5 tests modifier sequencing and composition, a
unique concern for pipeline architectures.

**Concurrency gaps exist across all approaches.** No approach tests abort signals or race conditions
(concurrent request resolution ordering). A4 comes closest with deferred promise isolation. This is
acceptable for list/detail patterns but would be a risk in real-time collaboration contexts.

### Evidence

A2 requires 6 hoisted mocks for any test:

```typescript
const { mockGetProducts, mockGetProduct, mockCreateProduct, ... } = vi.hoisted(() => ({
    mockGetProducts: vi.fn(), mockGetProduct: vi.fn(), // + 4 more
}));
vi.mock('@app/pages/_lego/_shared/api/ProductsService', () => ({ productsService: { ... } }));
```

A4 loading state transition verification (deferred promise pattern):

```typescript
const deferred = createDeferredPromise<any>();
mockGetProducts.mockReturnValue(deferred.promise);
// verify loading state, then:
deferred.resolve({ items: mockProducts, pagination: { ... } });
// verify not-loading state
```

A5 modifier sequencing test verifies `custom1: 'overridden'` (last modifier wins).

---

## Axis 3 — Simplicite des pages

_How simple is it to write a new page: few lines, few concepts, copy-paste friendly?_

| Approach | S1 lines | S3 lines | Concepts to learn               | Style                    | Copy-paste friendly?       | Score (1-5) |
| -------- | -------- | -------- | ------------------------------- | ------------------------ | -------------------------- | ----------- |
| A1       | 7        | 17       | 1 (features array)              | Pure config              | Yes; adjust features only  | 5           |
| A2       | 7        | 18       | 1 + provider wrap               | Pure config + setup      | Yes; wrap + features       | 4           |
| A3       | 7        | 18       | 6+ (one hook per feature)       | Mixed hooks + array      | Hard; write all hook calls | 2           |
| A4       | 15       | 22       | 2 (compound + context hook)     | Imperative nesting       | Moderate; complex JSX tree | 3           |
| A5       | 9        | 15       | 2 (modifiers + composition)     | Mixed config/imperative  | Yes; duplicate modifiers   | 4           |
| A6       | 16       | 42       | 3+ (Data2, hooks, render props) | Imperative orchestration | No; hook wiring required   | 1           |

### Key Findings

**A1 is the clear winner for page simplicity.** Its purely declarative configuration model keeps pages
minimal. A junior developer can copy `S1Page.tsx`, change the columns array and service reference, and
have a working page. The features array is self-documenting:
`['search', 'pagination', { type: 'crud', dialog: ProductDialogAdapter }]` reads like natural intent.

**A2 and A5 offer usable trade-offs.** A2 adds one setup concept (provider wrap) but maintains A1's
simplicity gain. A5 stays compact even with features (15 lines for S3 vs 17 for A1), and the modifier
composition pattern is learnable. Both are copy-paste friendly for basic scenarios.

**A3 degrades copy-paste friendliness significantly.** S3Page requires explicitly importing and calling
6 separate feature hooks. Developers must know which hooks to instantiate and in what order, friction
that compounds with each new scenario.

**A6 is the least suitable for developer simplicity.** S3Page's 42-line footprint is dominated by hook
setup and imperative callbacks (`useCallback` factories, hook wiring, adaptCol mappings). The
copy-paste cost is high.

### Evidence

A1 S1Page core: `<WidgetDataTable service={productsService} columns={columns} features={[]} />` (1 line)

A3 S3Page requires 6 separate hook instantiations:

```tsx
const search = useSearchFeature({ placeholder: 'Search...' });
const pagination = usePaginationFeature({ defaultSize: 10, pageSizes: [10, 20, 50] });
const sorting = useSortingFeature({ multi: true });
const columnVisibility = useColumnVisibilityFeature();
const bulkDelete = useBulkDeleteFeature();
const crud = useCrudFeature(ProductDialogAdapter);
const features = [search, pagination, sorting, columnVisibility, bulkDelete, crud];
```

A6 S3Page exceeds A1 by 25 lines due to imperative hook composition.

---

## Axis 4 — Coherence

_How uniform is each approach's pattern across all 15 scenarios?_

| Approach | Pattern uniformity | Drift risk  | Blessed path exists? | Score (1-5) |
| -------- | ------------------ | ----------- | -------------------- | ----------- |
| A1       | Very high          | Low         | Yes                  | 5           |
| A2       | Very high          | Low         | Yes                  | 5           |
| A3       | Medium-high        | Medium      | Partial              | 3           |
| A4       | Medium             | Medium-high | Partial              | 3           |
| A5       | Medium             | Medium      | Partial              | 3           |
| A6       | Medium-high        | Medium      | Partial              | 3           |

### Key Findings

**A1 and A2 achieve near-perfect consistency.** Both present a single, unmistakable pattern that all
pages follow. In A1, every page is declarative: widgets handle all state and event coordination
internally; pages only configure. A2 is equally rigid: pages wrap everything in `<ProductProvider>`
and delegate to context-aware components. No page in either approach implements custom logic or takes
a different structural route.

**A3, A4, A5, and A6 tolerate structural variation.** These approaches allow — or even encourage —
page-level customization. Simple pages are minimal, but complex pages add custom state, effects, or
event handlers, diverging significantly from the simple page structure. A4's `S3Page` extracts a
nested `S3Content` function calling `useDataTable()` context, a pattern entirely absent from `S1Page`.
A3's `S_BUS` jumps to 63 lines with custom state, `useRef`, and keyboard handlers, vs S1's 7 lines.

**WebSocket pages uniformly break the pattern across all approaches.** `S_WS` scenarios discard the
approach's standard components and render raw `<Table>` / `<Table2>` components directly with inline
state. This is consistent _across_ approaches but inconsistent _within_ them, revealing a shared
abstraction boundary.

### Evidence

- A1 S_BUS (11 lines): identical pattern to S7, purely declarative with `emits`/`listens` props
- A3 S_BUS (63 lines): adds `useState` for items, `useRef` for container, custom `handleKeyDown`
  and `handleRowSelect` logic — structurally unrecognizable vs S1 (7 lines)
- A4 S3Page: extracts nested `S3Content` component calling `useDataTable()` + `handleSave` logic,
  pattern absent from S1

---

## Axis 5 — New Feature Extensibility

_To add a brand-new feature, must the framework be modified, or can it be added at the page level only?_

| Approach | S_WS: framework change? | S_BUS: framework change? | Feature at page level? | Architecture                        | Score (1-5) |
| -------- | ----------------------- | ------------------------ | ---------------------- | ----------------------------------- | ----------- |
| A1       | Yes                     | Yes                      | No                     | Closed (immutable widgets)          | 1           |
| A2       | Yes                     | Yes                      | No                     | Closed (provider + views)           | 2           |
| A3       | No                      | Partial                  | Mostly                 | Semi-open (hooks + wrappers)        | 3           |
| A4       | No                      | Partial                  | Mostly                 | Semi-open (compound children)       | 3           |
| A5       | No                      | Partial                  | Mostly                 | Semi-open (modifiers + composition) | 4           |
| A6       | No                      | Partial                  | Mostly                 | Semi-open (adapters + injection)    | 3           |

### Key Findings

**A1 and A2 are closed architectures.** A1's `WidgetDataTable` is a closed unit — supporting
cross-widget communication via event bus required baking `EventBus`, `useOptionalEventBus`, and
`GlobalEventContext` directly into the framework. Every new interaction pattern requires framework
extension. A2 is similarly rigid: the `ProductProvider` must be expanded when new state (selection,
detail fetching, navigation) is needed.

**A3-A6 allow most new features to be composed at the page level.** S_WS pages in these approaches
use `useProductsWebSocket` + raw `<Table>` components directly, requiring zero framework changes. The
pattern holds for S_BUS: page-level state (selectedId, URL sync, keyboard navigation) is managed by
the page, not by framework abstractions.

**A5 (pipeline) achieves the best extensibility.** New filters, sorting strategies, or transformations
are added as pure `QueryModifier` functions passed to `usePipeline` — zero modification to the hook
itself. A6 introduced `adaptCol` as a composable adapter without altering either `Data2` or `Table2`.

### Evidence

- A1 S_BUS: EventBus infrastructure (`EventBus.ts`, `PageEventContext.tsx`, `useOptionalEventBus.ts`,
  `GlobalEventContext.tsx`) had to be built into the framework first
- A3/A5/A6 S_WS: all use `useProductsWebSocket()` + raw table component, zero framework modifications
- A5 S_BUS: `modifiers={[withPagination(1, 10)]}`, row-click handler at page level — framework
  provides optional abstractions that pages can ignore
- A6 `adaptCol.ts`: pure 40-line adapter, bridges two component systems without touching either

---

## Axis 6 — Maintenabilite

_Code quality, anti-pattern count, and cost of a global refactor._

| Approach | Largest file (lines)       | `any` count | Anti-patterns found                        | Global change cost | Score (1-5) |
| -------- | -------------------------- | ----------- | ------------------------------------------ | ------------------ | ----------- |
| A1       | 345 (WidgetDataTable)      | 3           | None critical                              | 3 files            | 4           |
| A2       | 290 (ProductDomainContext) | 1           | `void` fire-and-forget (4x), console.error | 3 files            | 3           |
| A3       | 349 (HookDataTable)        | 9           | `void` fire-and-forget (2x), prop drilling | 3 files            | 3           |
| A4       | 640 (DataTable)            | 12          | God component, frozen extension point      | 2-4 files          | 2           |
| A5       | 154 (usePipeline)          | 2           | State override complexity                  | 3 files            | 3           |
| A6       | 112 (Data2DetailPanel)     | 0           | None                                       | 1-2 files          | 5           |

**Anti-pattern inventory:**

| Anti-pattern                   | A1  | A2  | A3  | A4  | A5  | A6  |
| ------------------------------ | --- | --- | --- | --- | --- | --- |
| `any` types                    | 3   | 1   | 9   | 12  | 2   | 0   |
| `void` async (fire-and-forget) | 0   | 4   | 2   | 1   | 0   | 0   |
| `console.log` in framework     | 0   | 1   | 0   | 0   | 0   | 0   |
| God component (>400 lines)     | 0   | 0   | 0   | 1   | 0   | 0   |

### Key Findings

**A6 achieves the highest maintainability** by avoiding god components and anti-patterns entirely.
Framework files are deliberately small (59-112 lines) and single-purpose. Changing `defaultPageSize`
globally requires modifying at most 1-2 files since pagination state is centralized in the `Data2`
orchestrator, not scattered across display components.

**A4 suffers from a critical maintainability trap**: `DataTable.tsx` at 640 lines violates the
400-line threshold and mixes concerns (state management, UI composition, CRUD logic, pagination UI).
The compound pattern creates a frozen extension point — new slots must be added as static properties
on the component, preventing external customization. With 12 `any` types, the cognitive load is high.

**A2 introduces compounding technical debt**: `void loadItem(id)` fire-and-forget patterns (4
occurrences) bypass error handling, making silent production failures difficult to debug. Adding
features requires expanding the provider's surface area, coupling all views to the provider state.

**A5's state override complexity** is a subtle maintainability risk: the pipeline's `searchOverride`,
`pageOverride`, `pageSizeOverride` layers shadow modifier values, requiring developers to understand
both modifiers AND overrides when debugging query behavior.

### Evidence

Pagination refactoring cost (make `defaultPageSize` a global constant):

- A1: `useWidgetQuery.ts` + `WidgetDataTable.tsx` + `WidgetCarousel.tsx` -> 3 files
- A2: `ProductDomainContext.tsx` + `ViewDataTable.tsx` -> 2-3 files
- A3: `usePaginationFeature.ts` + `HookDataTable.tsx` -> 2-3 files
- A4: `DataTable.tsx` (3 locations) + `useTableDataFetch.ts` -> 2 files (centralized but monolithic)
- A5: `usePipeline.ts` + `PipelineContext.tsx` -> 2-3 files
- A6: `Data2` handles pagination state; only adapter/hook config -> 1 file

---

## Axis 7 — Error Avoidance (LLM Agent Friendliness)

_When an LLM coding agent writes a new page or adds a feature, how likely is it to make mistakes?_

| Approach | Self-documenting? | Style drift protection?    | Single path? | Silent failure risk           | Score (1-5) |
| -------- | ----------------- | -------------------------- | ------------ | ----------------------------- | ----------- |
| A1       | High              | Yes (structural test)      | Yes          | Low (compile-time errors)     | 4.5         |
| A2       | Medium            | Yes (structural test)      | Partial      | Medium (missing provider)     | 3.5         |
| A3       | Low               | Yes (structural test)      | No           | High (missing hook -> silent) | 2.5         |
| A4       | Low               | Yes (structural test)      | No           | High (missing slot -> silent) | 2.0         |
| A5       | Low               | Partial (inline style gap) | No           | Medium-high (modifier order)  | 2.5         |
| A6       | High              | Yes (structural test)      | Yes          | Low-medium (stale closures)   | 4.0         |

**API surface complexity (concept count required):**

| Approach | Concepts to master before writing a new page |
| -------- | -------------------------------------------- |
| A1       | 1 (features array)                           |
| A2       | 2 (features array + provider wrap)           |
| A3       | 7 (6 feature hooks + composition pattern)    |
| A4       | 5 (5+ compound component slots)              |
| A5       | 4 (modifier factories + composition)         |
| A6       | 3 (Data2 + adaptCol + hooks2)                |

### Key Findings

**A1 and A6 are the most LLM-friendly approaches.** A1 succeeds because pages are simple, APIs are
fixed, and features are declarative. The widget either renders correctly or throws a compile-time
error — no silent failures. The features array is self-limiting: an LLM cannot accidentally pass
invalid callbacks because the API doesn't accept them. A6 succeeds because it uses generic,
well-understood primitives (hooks, render props, adapters) with a clear three-step pattern.

**A3 and A4 are most error-prone.** A3 requires knowledge of 6 feature hooks and their correct
composition order. If an LLM forgets `useCrudFeature(ProductDialogAdapter)`, the page compiles and
renders correctly — it simply lacks CRUD with no error or warning. A4 has the "slot proliferation"
problem: forgetting `<DataTable.Pagination>` produces an incomplete UI with no compile-time warning.

**A5 has an incomplete structural guard.** The `no-classname-in-pages.test.ts` test passes for A5,
yet `S3Page.tsx` contains inline `style={{ display: 'flex', ... }}` objects. The test uses string
pattern matching for `className=` but does not detect computed style objects, leaving A5 vulnerable
to style drift via JS-style attributes.

### Evidence

A1 self-limiting API — LLM cannot pass invalid props:

```tsx
<WidgetDataTable service={productsService} columns={columns} features={[]} />
// Cannot pass onSearch, onPaginate — the widget API doesn't accept them
```

A3 silent failure — hook type extraction returns `undefined` without error:

```typescript
// HookDataTable.tsx:
features.find(f => f.type === 'search'); // undefined if not present; feature silently absent
```

A5 structural gap — S3Page.tsx passes the className test but violates intent:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// Not caught by no-classname-in-pages.test.ts (tests for string attribute, not JS object)
```

---

## Final Scoring Table

| Axis                         | A1       | A2       | A3       | A4       | A5       | A6       |
| ---------------------------- | -------- | -------- | -------- | -------- | -------- | -------- |
| 1. Antifragilite             | 4        | 4        | 4        | 4        | **5**    | 4        |
| 2. Testabilite               | 3        | 2        | 4        | 4        | 4        | 4        |
| 3. Simplicite des pages      | **5**    | 4        | 2        | 3        | 4        | 1        |
| 4. Coherence                 | **5**    | **5**    | 3        | 3        | 3        | 3        |
| 5. New feature extensibility | 1        | 2        | 3        | 3        | 4        | 3        |
| 6. Maintenabilite            | 4        | 3        | 3        | 2        | 3        | **5**    |
| 7. Error avoidance           | 4.5      | 3.5      | 2.5      | 2.0      | 2.5      | 4.0      |
| **Total**                    | **26.5** | **23.5** | **21.5** | **21.0** | **25.5** | **24.0** |

---

## Recommended Approach by Use Case

| Use case                                   | Recommended | Rationale                                                                    |
| ------------------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| **Junior developer writing new pages**     | A1          | Pure config, 1 concept, copy-paste friendly, impossible to misuse            |
| **LLM agent generating code**              | A1          | Self-limiting API, declarative features, no silent failure modes             |
| **Testability-first team**                 | A5 or A4    | Minimal mocks, pure function modifiers (A5) or deferred state checks (A4)    |
| **Long-term maintainability**              | A6          | No god components, no anti-patterns, lowest global refactor cost             |
| **Maximum new feature extensibility**      | A5          | Modifier pattern is open by design; pipeline grows without framework changes |
| **Pattern uniformity across a large team** | A1 or A2    | Single blessed path, zero structural drift, all pages look identical         |
| **Senior developer, complex scenarios**    | A5          | Pipeline modifiers are powerful and composable; testable pure functions      |

---

## Summary

**A1 (widget-isolated)** is the most practical approach for most teams. It scores highest overall
(26.5), leads on page simplicity and consistency, and is the safest for LLM code generation. Its
main weakness is extensibility — new interaction patterns (WebSocket, event bus) require
framework-level investment upfront.

**A5 (query-pipeline)** is the best architecture for growing systems. Perfect antifragilite
(Score 5), strong testability, and open extensibility make it the most durable choice. Its higher
learning curve and inconsistent page structure are trade-offs that pay off at scale.

**A4 (context-children)** is the weakest overall (21.0). The god component risk (`DataTable.tsx`
at 640 lines), frozen extension points, and high silent failure risk make it the most fragile
approach long-term.

**A6 (data2-based)** is a strong specialist: unmatched maintainability and clean test isolation,
but page complexity (42 lines for S3 vs 17 for A1) makes it unsuitable as a general-purpose
pattern for most developers.
