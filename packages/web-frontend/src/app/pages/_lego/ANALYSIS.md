# Lego Approaches: Antifragility Analysis

> Date: 2026-03-05
> Scope: 6 React architecture approaches (A1–A6) across 15 scenarios (S1–S11, S_BUS, S_2TABLES,
> S_EDIT, S_FORK_FEAT, S_WS).
>
> Framework: Nassim Taleb's Antifragility triad — Fragile / Robust / Antifragile.
>
> - **Fragile**: degrades when exposed to novel requirements (change hurts)
> - **Robust**: holds steady under novel requirements (change is neutral)
> - **Antifragile**: improves when exposed to novel requirements (change benefits the system)

---

## 1. Approaches under evaluation

| ID  | Name             | Core mechanism                                          |
| --- | ---------------- | ------------------------------------------------------- |
| A1  | Widget-Isolated  | Self-contained widget; eventBus + service wrapper       |
| A2  | Context-Provider | Domain context above page; view components consume      |
| A3  | Feature-Hooks    | Page owns feature hooks; passes instances to widget     |
| A4  | Context-Children | Compound component; DataTable root + sub-components     |
| A5  | Query-Pipeline   | Pure modifier functions compose query; no shared state  |
| A6  | Data2-Based      | Render props + hook contracts; framework-native pattern |

---

## 2. Measurement: code growth under novel requirements

**Method**: Compare S3_FullFeatured (stable, known scenario) against S_FORK_FEAT (novel,
adds bookmarking + localStorage + filtering toggle). Growth = (S_FORK_FEAT − S3) / S3.

| Approach | S3 lines | S_FORK_FEAT lines | Growth | Notes                                               |
| -------- | -------- | ----------------- | ------ | --------------------------------------------------- |
| A1       | 58       | 170               | +193%  | Full feature via service wrapper                    |
| A2       | 55       | 133               | +142%  | **Bookmark filtering omitted — feature incomplete** |
| A3       | 69       | 135               | +96%   | Full feature; pages grow linearly                   |
| A4       | 88       | 138               | +57%   | Full feature; compound slots absorb growth          |
| A5       | 65       | 175               | +169%  | Full feature; extra modifier + helpers              |
| A6       | 124      | 215               | +73%   | Full feature; highest baseline, steady growth       |

**Key finding**: A2 shows the _smallest_ raw line count for S_FORK_FEAT (133 lines), yet it is
the only approach that could not implement the filtering toggle. Its low growth is due to
**omission**, not efficiency. A2's context-provider pattern lacks an interception point for
filtering query results — the A2 implementation explicitly notes:

> "Bookmark filtering not implemented for context-provider approach (would require custom
> provider wrapper)"

This is the defining signal for fragility analysis.

---

## 3. Classification

### Fragile (degrades under novel requirements)

#### A2 — Context-Provider

**Evidence**:

- S_FORK_FEAT cannot implement bookmark filtering without a "custom provider wrapper" — the
  architecture does not admit a filtering injection point.
- `ProductDomainContext` is tightly coupled to a single item list; multi-source or filtered
  views require a full context rewrite.
- S_2TABLES requires two independent contexts — providers multiply, increasing nesting depth.
- `actions` in `useMemo` return `void`: no user feedback (A2.c limitation).

**Verdict**: A2 is reliable for the exact scenarios it was designed for (simple CRUD lists),
but actively breaks when scenarios push beyond that envelope. **Fragile: 4/5**.

---

#### A4 — Context-Children

**Evidence**:

- `DataTable` compound component has a **frozen evolution path**: adding any new feature
  (new sub-component type, new context key) requires modifying the `DataTable` root.
- S_WS on A4 is 117 lines of flat, non-reusable code — the compound component pattern
  adds no benefit when the scenario doesn't map to its sub-component hierarchy.
- The compound structure is verbose at the page level (A4.e): each slot must be composed
  explicitly, yet the slots are also inflexible once defined.

**Verdict**: A4 is robust for CRUD-heavy pages that fit the compound hierarchy, but fragile
when new requirements don't fit the slot model. **Fragile: 3.5/5**.

---

### Robust (holds steady under novel requirements)

#### A1 — Widget-Isolated

**Evidence**:

- Full implementation of S_FORK_FEAT (+193% growth) via **service wrapper** pattern — the
  widget accepts any service object, so filtering is injectable without changing the widget.
- EventBus enables cross-component communication without architectural changes.
- But: adding a new _display feature_ (e.g., card layout, grid view) requires modifying all
  `WidgetXxx` components — the widget is a closed system for rendering strategies (A1.h).

**Verdict**: A1 absorbs query/filter requirements via service injection, but resists display
evolution. Robust for composition-by-configuration, fragile for composition-by-rendering.
**Robust: 3/5**.

---

#### A3 — Feature-Hooks

**Evidence**:

- Each feature is an independent hook (`useSearchFeature`, `usePaginationFeature`, etc.).
  New features are new hooks — no existing code is modified.
- Pages grow linearly (+96% for S_FORK_FEAT) because the page must wire hooks explicitly,
  but this verbosity is transparent and readable (A3.d: "verbose pages is a feature").
- Display features still hard-coded in `HookDataTable` (A3.c, same limitation as A1.h).

**Verdict**: A3 handles novel query-composition requirements well. Each new scenario adds
code only where needed. Robust under most changes, but display evolution requires modifying
the `HookDataTable` widget. **Robust: 3.5/5**.

---

### Antifragile (improves under novel requirements)

#### A5 — Query-Pipeline

**Evidence**:

- Each new scenario produces a reusable **query modifier** (`withSearch`, `withPagination`,
  `withSort`, `withFeature`). The modifier library grows with each scenario, and future
  scenarios benefit from accumulated modifiers.
- S_WS on A5 (138 lines) is structured: `getStatusBadgeVariant()` and `getStatusLabel()`
  become reusable helpers. New scenarios calling these functions save code.
- `usePipeline` is a pure composition hook — unit-testable in isolation, zero React context
  dependencies (see `usePipeline.test.tsx`).
- Adding a new requirement = writing one modifier function. The modifier is reusable across
  all 15 scenarios without modification to existing code.

**Why antifragile**: The modifier library gets better with every new scenario. Disorder
(novel requirements) produces reusable artifacts. **Antifragile: 5/5**.

---

#### A6 — Data2-Based

**Evidence**:

- Render props + hook contracts mean each new feature is an independent hook (e.g.,
  `usePagination2`, `useSorting2`, `useSimpleSearch`). Zero coupling between hooks.
- S3_FullFeatured has the highest baseline (124 lines) because the render-prop pattern
  requires explicit wiring — but `S_FORK_FEAT` grows by only +73%, the second-lowest growth
  rate while implementing the full feature.
- New requirements produce reusable framework-level hooks. S_FORK_FEAT's bookmark hook
  is reusable across all future scenarios.
- Two independent Data2 instances for S_2TABLES require no architectural change.

**Why antifragile**: Like A5, novel requirements generate reusable hooks. The framework
benefits from each new scenario. **Antifragile: 4.5/5**.

---

## 4. Summary table

| Approach | Category    | Score | Key strength               | Key weakness                   |
| -------- | ----------- | ----- | -------------------------- | ------------------------------ |
| A1       | Robust      | 3/5   | Service-wrapper injection  | Display features hard-coded    |
| A2       | **Fragile** | 4/5   | Simple CRUD views          | No query interception point    |
| A3       | Robust      | 3.5/5 | Explicit hook composition  | Display features hard-coded    |
| A4       | **Fragile** | 3.5/5 | Zero wiring for CRUD slots | Frozen compound evolution path |
| A5       | Antifragile | 5/5   | Pure modifier accumulation | Higher page-level verbosity    |
| A6       | Antifragile | 4.5/5 | Hook-contract composition  | Higher baseline code volume    |

> Score = fragility score (higher = more fragile). Antifragile approaches scored 5 on the
> antifragility scale (inverted for consistency: A5 antifragility = 5/5, fragility ≈ 1/5).

---

## 5. Architectural implications

### When to choose each approach

| Scenario                                    | Recommended | Avoid  |
| ------------------------------------------- | ----------- | ------ |
| CRUD admin panel with stable requirements   | A2, A4      | A5, A6 |
| Growing product with frequent new scenarios | A5, A6      | A2, A4 |
| Team unfamiliar with functional composition | A1, A2, A4  | A5, A6 |
| Real-time/WebSocket requirements            | A1, A5, A6  | A2, A4 |
| Maximum test isolation                      | A5, A6      | A2     |
| Rapid prototyping                           | A2          | A6     |

### The composition gradient

```
Fragile ←————————————————————————————→ Antifragile
   A2         A4         A1    A3         A6    A5
(context)  (compound) (widget) (hooks)  (data2) (pipeline)
```

The gradient follows _composition strategy_: approaches that compose via **shared mutable
state** (A2, A4) are fragile; approaches that compose via **pure functions and hook
contracts** (A5, A6) are antifragile.

### The verbosity paradox

A2 has the _fewest lines_ for S*FORK_FEAT but is the \_most fragile* because those lines
are incomplete. A5 has one of the _highest growth rates_ (+169%) but produces a modifier
library that makes future scenarios cheaper. **Brevity ≠ resilience.**

---

## 6. Recommendations

1. **Use A5 or A6 for production systems that will evolve** — the upfront composition cost
   pays back as the scenario count grows beyond ~5 scenarios.

2. **Treat A2 as a prototyping tool** — it reaches limits quickly but is the fastest path
   to a working CRUD admin page.

3. **A4 is a pedagogical pattern** — compound components are an excellent teaching example
   but the frozen evolution path makes them unsuitable for systems with regular new
   requirements.

4. **A3 is the middle ground** — if your team prefers explicit hook composition but finds
   A5 modifier functions unfamiliar, A3 provides the same compositional benefits with more
   familiar React patterns.

5. **The "antifragile" test**: when a new requirement arrives, does it _generate_ a
   reusable artifact (A5: new modifier; A6: new hook) or does it _modify_ existing core
   code (A2: new context field; A4: new DataTable sub-component)? The former is antifragile.

---

_Generated from analysis of 6 approaches × 15 scenarios = 90 visual test configurations._
_Reference implementations: `packages/web-frontend/src/app/pages/_lego/`_
