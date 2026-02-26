# Architecture Comparison Study: 5 Approaches × 3 Views

## Context

When a page-builder AI agent assembles a CRUD page, the current architecture requires ~100 lines of manual plumbing (5 feature hooks, CRUD hooks, cross-feature wiring, Data2 composition, dialog routing). The spread-vs-named-props bug on ProjectsPage demonstrated how easy it is to silently break this plumbing.

This study implements 5 different composition architectures, each producing 3 identical views (table, list, cards) for the "ingredients" entity. Goal: determine which approach minimizes agent error surface while maintaining flexibility.

**Success criteria:**
- All 15 pages produce pixel-perfect identical rendering (enforced by sharing the same rendering components)
- All 15 pages pass the same shared test suite
- Each approach is self-contained in its own directory

---

## File Structure

```
packages/web-frontend/src/app/pages/architecture-comparison/
├── shared/
│   ├── IngredientTableView.tsx          Re-export of IngredientTable2
│   ├── IngredientCardView.tsx           Re-export of IngredientGrid3 + IngredientCard3
│   ├── IngredientListView.tsx           NEW vertical list view
│   ├── IngredientListView.test.tsx      Unit tests for list view
│   ├── ingredient-columns.ts           Re-export shared column/field definitions
│   ├── ViewTestSuite.test.tsx           Shared parameterized test (rendering layer)
│   └── test-helpers.ts                 Mock data + render utilities
├── v1-baseline/
│   ├── V1TablePage.tsx                  ~450 lines (copy of Ingredients2TablePage)
│   ├── V1ListPage.tsx                   ~450 lines (same plumbing, list view)
│   └── V1CardsPage.tsx                  ~450 lines (copy of Ingredients3GridPage)
├── v2-single-hook/
│   ├── useIngredientsPage.ts            ~250 lines (composition hook)
│   ├── V2TablePage.tsx                  ~40 lines
│   ├── V2ListPage.tsx                   ~40 lines
│   └── V2CardsPage.tsx                  ~40 lines
├── v3-compound/
│   ├── DataPage.tsx                     ~350 lines (compound component + scoped context)
│   ├── DataPageSlots.tsx                ~200 lines (Header, Search, Content, etc.)
│   ├── V3TablePage.tsx                  ~30 lines
│   ├── V3ListPage.tsx                   ~30 lines
│   └── V3CardsPage.tsx                  ~30 lines
├── v4-config-driven/
│   ├── EntityPage.tsx                   ~400 lines (single config component)
│   ├── V4TablePage.tsx                  ~20 lines
│   ├── V4ListPage.tsx                   ~20 lines
│   └── V4CardsPage.tsx                  ~20 lines
├── v5-hook-plus-shell/
│   ├── usePageFeatures.ts              ~250 lines (state hook)
│   ├── CrudPageShell.tsx               ~100 lines (layout with named slots)
│   ├── V5TablePage.tsx                  ~25 lines
│   ├── V5ListPage.tsx                   ~25 lines
│   └── V5CardsPage.tsx                  ~25 lines
└── ComparisonIndex.tsx                  Navigation page (links to all 15 pages)
```

---

## Implementation Phases

### Phase 0: Git branch
- Create `feature/architecture-comparison` from `main`

### Phase 1: Shared Rendering Components

**IngredientTableView.tsx** — Re-export `IngredientTable2` from `ingredients2/`:
```tsx
export { IngredientTable2 as IngredientTableView } from '@app/pages/ingredients2/IngredientTable2';
export { INGREDIENT_TABLE2_COLUMNS } from '@app/pages/ingredients2/IngredientTable2';
```

**IngredientCardView.tsx** — Re-export `IngredientGrid3` from `ingredients3/`:
```tsx
export { IngredientGrid3 as IngredientCardView } from '@app/pages/ingredients3/IngredientGrid3';
export { INGREDIENT_GRID_FIELDS } from '@app/pages/ingredients3/IngredientGrid3';
```

**IngredientListView.tsx** — NEW component (~250 lines). Must implement `QueryResultDisplayerProps<Ingredient>`:
- Layout: vertical stack, each item is a horizontal band
- Left: selection checkbox
- Main: Name (bold) + category (muted) on top line, nutritional values as inline badges below
- Right: Edit/Delete icon buttons
- Bottom: pagination controls (same as Grid3)
- Top: sort dropdown (same pattern as Grid3)
- States: loading skeleton, empty, error, refreshing blur, deleting strikethrough
- Reuses existing components: `Pagination`, `PageSizeSelector`, `Button`, `Checkbox`

**ingredient-columns.ts** — Re-exports for convenience:
```tsx
export { INGREDIENT_TABLE2_COLUMNS } from '@app/pages/ingredients2/IngredientTable2';
export { INGREDIENT_GRID_FIELDS } from '@app/pages/ingredients3/IngredientGrid3';
```

### Phase 2: Shared Test Infrastructure

**test-helpers.ts** — Centralized mock data + utilities:
- `mockIngredients[]` (3 items: Chicken Breast/Protein, Brown Rice/Grain, Broccoli/Vegetable)
- `createBaseProps()` factory returning `QueryResultDisplayerProps<Ingredient>` with defaults
- `renderWithRouter(ui, route?)` wrapper for router-dependent components

**ViewTestSuite.test.tsx** — Parameterized over the 3 view components:
```tsx
const views = [
  { name: 'TableView', Component: IngredientTableView, ... },
  { name: 'CardView', Component: IngredientCardView, ... },
  { name: 'ListView', Component: IngredientListView, ... },
];

describe.each(views)('$name', ({ Component }) => {
  // Data display: renders all names, nutritional values, categories
  // Loading state: skeleton with animate-pulse
  // Empty state: shows empty message
  // Error state: displays error
  // Actions: edit/delete buttons, callbacks with correct args
  // Pagination: renders controls, calls onPageChange
  // Sorting: renders controls, calls onSortChange
  // Refreshing: visual blur/opacity feedback
  // Selection: checkboxes, toggle callback
});
```

### Phase 3: V1-Baseline (reference implementation)

Copy existing `Ingredients2TablePage` → `V1TablePage.tsx`, adapting:
- Import `IngredientTableView` from shared
- `storageId: 'comparison-v1-table'`
- `basePath: '/comparison/v1/table'`

Same for V1CardsPage (from Ingredients3GridPage) and V1ListPage (same plumbing, `IngredientListView`).

These are ~450 lines each. They represent the status quo: maximum plumbing, maximum flexibility.

### Phase 4: V2-SingleHook (Refine/TanStack style)

**useIngredientsPage.ts** (~250 lines) — Single composition hook:
- Input: `{ storageId, basePath, pageSize?, pageSizeOptions?, defaultSort? }`
- Creates internally: usePagination2, useSorting2, useSimpleSearch, useCacheControl2, useMultiSelect2
- Wires: search → pagination reset, cache refresh after CRUD
- Sets up: useIngredientsCrud, useDeleteConfirmation, useBulkDeleteState, useMutationCleanup, useRoutedDialog
- Returns organized prop bundles: `{ data2Props, headerProps, searchProps, bulkActionProps, contentProps, dialogProps, deleteConfirmationProps, bulkDeleteWorkflowProps }`

**Page components** (~40 lines each) — JSX only:
```tsx
function V2TablePage() {
  const page = useIngredientsPage({ storageId: '...', basePath: '...', pageSize: 10 });
  return (
    <Page>
      <PageHeader title="Ingredients" {...page.headerProps} action={...} />
      <SearchBar {...page.searchProps} />
      {!page.bulkActionProps.isEmpty && <BulkActionBar {...page.bulkActionProps}>...</BulkActionBar>}
      <Data2 {...page.data2Props}>
        {injected => <IngredientTableView {...injected} {...page.contentProps} />}
      </Data2>
      <IngredientDialog {...page.dialogProps} />
      <AlertDialogWrapper {...page.deleteConfirmationProps} />
      <BulkDeleteWorkflow {...page.bulkDeleteWorkflowProps} />
    </Page>
  );
}
```

### Phase 5: V3-Compound (React Admin style)

**DataPage.tsx** (~350 lines) — Compound component with scoped context:
- `<DataPage>` root: creates all hooks, provides context
- `<DataPage.Header>`: consumes context for refresh
- `<DataPage.Search>`: consumes context for search state
- `<DataPage.BulkActions>`: consumes context for selection
- `<DataPage.Content>`: wraps Data2, injects props to render prop child
- `<DataPage.CreateDialog>`: consumes context for dialog state
- `<DataPage.DeleteConfirmation>`: consumes context
- `<DataPage.BulkDelete>`: consumes context

Context is **scoped** (not global). Lives only within `<DataPage>` tree.

**Page components** (~30 lines each):
```tsx
function V3TablePage() {
  return (
    <DataPage storageId="..." basePath="..." pageSize={10}>
      <DataPage.Header title="Ingredients" createButton />
      <DataPage.Search placeholder="Search ingredients..." />
      <DataPage.BulkActions />
      <DataPage.Content>
        {props => <IngredientTableView {...props} />}
      </DataPage.Content>
      <DataPage.CreateDialog component={IngredientDialog} />
      <DataPage.DeleteConfirmation entity="ingredient" />
      <DataPage.BulkDelete entity="ingredient" />
    </DataPage>
  );
}
```

### Phase 6: V4-ConfigDriven

**EntityPage.tsx** (~400 lines) — Single component, everything via config:
- Creates all hooks internally
- Renders fixed layout: Header → Search → BulkActions → Data2+Content → Dialogs
- Config props: `fetchData`, `renderContent`, `pagination`, `sorting`, `search`, `createDialog`, `deleteApi`, `bulkDeleteApi`, etc.

**Page components** (~20 lines each):
```tsx
function V4TablePage() {
  return (
    <EntityPage
      entity="ingredient" title="Ingredients"
      storageId="..." basePath="..."
      fetchData={fetchIngredients}
      renderContent={props => <IngredientTableView {...props} />}
      pagination={{ pageSize: 10 }}
      sorting={{ default: [{ key: 'name', direction: 'asc' }] }}
      search={{ placeholder: 'Search ingredients...' }}
      createDialog={IngredientDialog}
      deleteApi={ingredientsService.deleteIngredient}
      bulkDeleteApi={ingredientsService.bulkDeleteIngredients}
    />
  );
}
```

### Phase 7: V5-HookPlusShell (Hybrid)

**usePageFeatures.ts** (~250 lines) — Like V2 but returns props shaped for the shell:
- Same internal logic as V2
- Returns: `{ shellProps, data2Props, contentProps, dialogs: ReactNode }`

**CrudPageShell.tsx** (~100 lines) — Layout with named slots:
```tsx
function CrudPageShell({ title, headerAction, search, bulkActions, content, dialogs, ...headerProps }) {
  return (
    <Page>
      <PageHeader title={title} action={headerAction} {...headerProps} />
      {search}
      {bulkActions}
      {content}
      {dialogs}
    </Page>
  );
}
```

**Page components** (~25 lines each):
```tsx
function V5TablePage() {
  const page = usePageFeatures({ storageId: '...', basePath: '...', pageSize: 10 });
  return (
    <CrudPageShell
      {...page.shellProps}
      title="Ingredients"
      content={
        <Data2 {...page.data2Props}>
          {injected => <IngredientTableView {...injected} {...page.contentProps} />}
        </Data2>
      }
      dialogs={page.dialogs}
    />
  );
}
```

### Phase 8: Routing & Navigation

**ComparisonIndex.tsx** — Grid of links to all 15 pages, organized by approach × view.

**App.tsx** — Add routes:
```
/comparison                    → ComparisonIndex
/comparison/v{1-5}/{table|list|cards}          → Page
/comparison/v{1-5}/{table|list|cards}/:mode    → Page (create)
/comparison/v{1-5}/{table|list|cards}/:id/:mode → Page (edit)
```

**navigationConfig.ts** — Add "Comparison" entry in sidebar.

### Phase 9: Verification

1. **TypeScript**: `npm run check` passes
2. **Tests**: Shared ViewTestSuite passes for all 3 rendering components
3. **Visual**: Open ComparisonIndex, navigate each approach's table/list/cards — verify identical rendering
4. **Functional**: In each approach, perform: create, edit, delete, bulk delete, search, sort, paginate, refresh
5. **Screenshot comparison**: Use browser agent to capture screenshots of each approach's views side-by-side

---

## Key Reusable Existing Code

| What | Path |
|------|------|
| Table rendering | `pages/ingredients2/IngredientTable2.tsx` |
| Card rendering | `pages/ingredients3/IngredientGrid3.tsx` + `IngredientCard3.tsx` |
| Column definitions | `IngredientTable2.tsx` → `INGREDIENT_TABLE2_COLUMNS` |
| Field definitions | `IngredientGrid3.tsx` → `INGREDIENT_GRID_FIELDS` |
| API client | `pages/ingredients/ingredients.api.ts` |
| Service | `pages/ingredients/IngredientsService.ts` |
| CRUD hook | `pages/ingredients/useIngredientsCrud.ts` |
| Dialog | `components/domain/IngredientDialog.tsx` |
| Bulk delete | `components/domain/BulkDeleteWorkflow.tsx` |
| Feature hooks | `framework/hooks2/data/usePagination2.ts`, `useSorting2.ts`, `useSimpleSearch.ts`, `useCacheControl2.ts` |
| Selection hook | `framework/hooks2/utility/useMultiSelect2.ts` |
| CRUD helpers | `framework/hooks/useBulkDeleteState.ts`, `useDeleteConfirmation.ts`, `useCrudSuccessToast.ts`, `useMutationCleanup.ts` |
| Data2 | `framework/components2/data/Data2.tsx` |
| Layout | `framework/components/layout/Page.tsx`, `PageHeader.tsx` |
| QueryResultDisplayerProps | `framework/types/QueryResultDisplayerContract.ts` |

---

## Approach Comparison (what to evaluate after implementation)

| Criteria | V1 Baseline | V2 SingleHook | V3 Compound | V4 Config | V5 Hook+Shell |
|----------|-------------|---------------|-------------|-----------|---------------|
| Lines per page | ~450 | ~40 | ~30 | ~20 | ~25 |
| New abstractions | 0 | 1 hook | 1 compound + context | 1 component | 1 hook + 1 shell |
| Agent error surface | High | Low | Low | Lowest | Low |
| Flexibility | Maximum | High | Medium | Low | High |
| Discoverability | Low | High | High | High | High |
| Testing complexity | Low | Low | Medium (context) | Low | Low |
