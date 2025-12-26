# Plan: Column Visibility & Ordering for Table2 and Grid3

**Date:** 2025-12-26_10-30
**Objective:** Ajouter le bouton "columns" du header (comme Ingredients v1) pour gérer l'ordre et la visibilité des colonnes dans Table2 et Grid3, sans duplication de code.

---

## User Requirements

- S'inspirer fortement de Ingredients v1 pour ajouter dans v2 et v3 le bouton "columns" du header
- Gérer l'ordre et la visibilité des colonnes
- C'est une nouvelle feature qui doit être créée pour Table2 et Grid3
- Pas de duplication entre Table2 et Grid3 - mêmes features
- **Pour Grid3:** Utiliser le même bouton + popup que Table2, afficher/masquer et réordonner les champs dans les cartes
- **Important:** Le "nom" doit être protégé contre hide ET re-ordering (toujours visible et toujours en premier)
- **Nouveau besoin (antifragilité):** Ajouter une contrainte `canReorder?: boolean` pour empêcher le réordonnancement de certaines colonnes/champs
    - Cette fonctionnalité n'existe pas actuellement dans la feature des colonnes v1
    - Elle doit être ajoutée aux hooks et composants existants

---

## Architecture Overview

### Design Philosophy

1. **Zero duplication** - Réutiliser tous les composants et hooks de v1 sans modification
2. **Page-level composition** - La visibilité des colonnes est une responsabilité de la page, pas des composants
3. **Maximum reusability** - Même pattern pour Table2 et Grid3
4. **Backward compatible** - Table2/Grid3 continuent de fonctionner sans la feature

### Key Decision

- **Logic location:** Page (Ingredients2Page, Ingredients3GridPage)
- **NOT in:** Table2 ou Grid3 components (ils restent pure presentation)
- **Button location:** Page header (comme v1)
- **Reused components:** `ColumnVisibility`, `useColumnVisibility`, `useColumnOrder` (pas de changement)

---

## Implementation Phases

### Phase 1: Core Infrastructure

#### 1.0. Extend Column Ordering Hook (NEW FEATURE - Antifragilité)

**File:** `packages/web-frontend/src/framework/components/columns/useColumnOrder.ts`

Add support for `canReorder` constraint:

```typescript
export interface UseColumnOrderOptions {
	storageId: string;
	defaultOrder: string[];
	storage?: StorageAdapter;
	// NEW: Column constraints (e.g., canReorder)
	constraints?: Record<string, { canReorder: boolean }>;
}

// Update reorderColumns to check constraints before reordering
const reorderColumns = useCallback(
	(activeId: string, overId: string) => {
		setColumnOrder(prev => {
			// NEW: Check if activeId can be reordered
			if (constraints && constraints[activeId] && !constraints[activeId].canReorder) {
				return prev; // Cannot reorder this column, no-op
			}

			// Existing logic...
		});
	},
	[constraints]
);
```

#### 1.1. Extend `Table2Column<T>` Interface

**File:** `packages/web-frontend/src/framework/components2/table/Table2.tsx`

Add visibility and ordering metadata to interface (backward compatible):

```typescript
export interface Table2Column<T> {
	key: string;
	label: string | ReactNode;
	render: (item: T) => ReactNode;
	className?: string;
	sortable?: boolean;

	// NEW: Column visibility metadata (optional)
	canHide?: boolean; // Default: true
	defaultVisible?: boolean; // Default: true

	// NEW: Column ordering metadata (optional)
	canReorder?: boolean; // Default: true (NEW FEATURE)
}
```

#### 1.2. Create Utility Functions for Table2

**New File:** `packages/web-frontend/src/framework/utils2/Table2ColumnConfig.ts`

Mirror existing `ColumnConfig.ts` but for `Table2Column<T>`:

```typescript
import type { Table2Column } from '@framework/components2/table/Table2';
import type { ColumnDef } from '@framework/components/columns/ColumnVisibility';

// Convert Table2Column[] to ColumnDef[] for ColumnVisibility component
export function toColumnVisibilityDefs<T>(columns: Table2Column<T>[]): ColumnDef[];

// Extract column IDs (keys)
export function extractColumnIds<T>(columns: Table2Column<T>[]): string[];

// Extract default visible column IDs
export function extractDefaultVisible<T>(columns: Table2Column<T>[]): string[];

// Extract canHide constraints
export function extractCanHideConstraints<T>(columns: Table2Column<T>[]): Record<string, { canHide: boolean }>;

// NEW: Extract canReorder constraints
export function extractCanReorderConstraints<T>(columns: Table2Column<T>[]): Record<string, { canReorder: boolean }>;

// Apply visibility filter to columns
export function applyColumnVisibility<T>(columns: Table2Column<T>[], visibleColumns: Set<string>): Table2Column<T>[];

// Apply order to columns
export function applyColumnOrder<T>(columns: Table2Column<T>[], columnOrder: string[]): Table2Column<T>[];
```

**Implementation details:**

- Similar to `packages/web-frontend/src/framework/utils/table/ColumnConfig.ts`
- Work with `Table2Column<T>` instead of `TableColumn<T>`
- `defaultVisible` defaults to `true` if not specified (opposite of v1 which defaults to `false`)

---

### Phase 2: Table2 Integration (Ingredients2Page)

#### 2.1. Update Column Definitions

**File:** `packages/web-frontend/src/app/pages/ingredients2/IngredientTable2.tsx`

Add metadata to `INGREDIENT_TABLE2_COLUMNS`:

```typescript
export const INGREDIENT_TABLE2_COLUMNS: Table2Column<Ingredient>[] = [
  {
    key: 'id',
    label: 'ID',
    render: ...,
    defaultVisible: false,  // Hidden by default
  },
  {
    key: 'name',
    label: 'Name',
    render: ...,
    canHide: false,     // Cannot be hidden (always visible)
    canReorder: false,  // Cannot be reordered (always first) - NEW
  },
  {
    key: 'calories',
    label: 'Calories',
    render: ...,
    // canHide: true, defaultVisible: true, canReorder: true (defaults)
  },
  // ... rest of columns
];
```

#### 2.2. Accept Column Override Prop

**File:** `packages/web-frontend/src/app/pages/ingredients2/IngredientTable2.tsx`

Update interface and component:

```typescript
export interface IngredientTable2Props extends Partial<Table2Props<Ingredient>> {
  columns?: Table2Column<Ingredient>[]; // NEW: Allow column override
  onEdit?: (ingredient: Ingredient) => void;
  onDelete?: (id: string) => void;
  refreshing?: boolean;
}

export function IngredientTable2({
  columns = INGREDIENT_TABLE2_COLUMNS, // Default to full set
  onEdit,
  onDelete,
  refreshing,
  ...tableProps
}: IngredientTable2Props) {
  return (
    <Table2
      columns={columns}  // Use provided or default
      getItemId={item => item.id}
      renderActions={...}
      {...tableProps}
    />
  );
}
```

#### 2.3. Add Feature to Page

**File:** `packages/web-frontend/src/app/pages/ingredients2/Ingredients2Page.tsx`

Add hooks and UI:

```typescript
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import {
  toColumnVisibilityDefs,
  extractColumnIds,
  extractDefaultVisible,
  extractCanHideConstraints,
  applyColumnVisibility,
  applyColumnOrder,
} from '@framework/utils2/Table2ColumnConfig';
import { INGREDIENT_TABLE2_COLUMNS } from './IngredientTable2';

// In component:

// Column visibility hook
const columnVisibility = useColumnVisibility(
  extractColumnIds(INGREDIENT_TABLE2_COLUMNS),
  {
    storageId: STORAGE_ID,
    defaultVisible: extractDefaultVisible(INGREDIENT_TABLE2_COLUMNS),
    constraints: extractCanHideConstraints(INGREDIENT_TABLE2_COLUMNS),
  }
);

// Column ordering hook (with canReorder constraints)
const columnOrder = useColumnOrder({
  storageId: STORAGE_ID,
  defaultOrder: extractColumnIds(INGREDIENT_TABLE2_COLUMNS),
  constraints: extractCanReorderConstraints(INGREDIENT_TABLE2_COLUMNS), // NEW
});

// Apply visibility + ordering to columns
const visibleOrderedColumns = useMemo(() => {
  let cols = INGREDIENT_TABLE2_COLUMNS;
  cols = applyColumnVisibility(cols, columnVisibility.visibleColumns);
  cols = applyColumnOrder(cols, columnOrder.columnOrder);
  return cols;
}, [columnVisibility.visibleColumns, columnOrder.columnOrder]);

// In header JSX (before "Add Ingredient" button):
<ColumnVisibility
  columns={toColumnVisibilityDefs(INGREDIENT_TABLE2_COLUMNS)}
  visibleColumns={columnVisibility.visibleColumns}
  defaultVisible={new Set(extractDefaultVisible(INGREDIENT_TABLE2_COLUMNS))}
  onToggle={columnVisibility.toggleColumn}
  onReset={() => {
    columnVisibility.resetColumns();
    columnOrder.resetOrder();
  }}
  onShowAll={columnVisibility.showAll}
  onHideAll={columnVisibility.hideAll}
  isColumnModified={columnVisibility.isColumnModified}
  onResetColumn={columnVisibility.resetColumn}
  columnOrder={columnOrder.columnOrder}
  defaultOrder={extractColumnIds(INGREDIENT_TABLE2_COLUMNS)}
  onReorderColumns={columnOrder.reorderColumns}
  isColumnModifiedOrder={columnOrder.isColumnModified}
  onResetColumnOrder={columnOrder.resetColumn}
/>

// Pass to table:
<Data2 ...>
  <IngredientTable2
    columns={visibleOrderedColumns}  // NEW
    onEdit={handleEdit}
    onDelete={handleDelete}
  />
</Data2>
```

---

### Phase 3: Grid3 Integration (Ingredients3GridPage)

**Strategy:** Utiliser le même pattern que Table2 mais appliqué aux champs des cartes.

#### 3.1. Define Field Configuration

**File:** `packages/web-frontend/src/app/pages/ingredients3/IngredientGrid3.tsx`

Create field definitions (similar to columns):

```typescript
import type { Table2Column } from '@framework/components2/table/Table2';

// Reuse Table2Column interface for field definitions (for compatibility with utilities)
export const INGREDIENT_GRID_FIELDS: Table2Column<Ingredient>[] = [
	{
		key: 'name',
		label: 'Name',
		render: item => item.name,
		canHide: false, // Name is always visible as card title (protected)
		canReorder: false, // Name cannot be reordered (always first) - NEW
		defaultVisible: true,
	},
	{
		key: 'calories',
		label: 'Calories',
		render: item => `${item.calories} cal`,
		defaultVisible: true,
	},
	{
		key: 'protein',
		label: 'Protein',
		render: item => `${item.protein}g`,
		defaultVisible: true,
	},
	{
		key: 'carbs',
		label: 'Carbs',
		render: item => `${item.carbs}g`,
		defaultVisible: true,
	},
	{
		key: 'fat',
		label: 'Fat',
		render: item => `${item.fat}g`,
		defaultVisible: true,
	},
	{
		key: 'category',
		label: 'Category',
		render: item => item.category || '-',
		defaultVisible: true,
	},
	{
		key: 'id',
		label: 'ID',
		render: item => item.id,
		defaultVisible: false, // Hidden by default
	},
	{
		key: 'createdAt',
		label: 'Created',
		render: item => formatDate(item.createdAt).short,
		defaultVisible: false, // Hidden by default
	},
	{
		key: 'updatedAt',
		label: 'Updated',
		render: item => formatDate(item.updatedAt).short,
		defaultVisible: false, // Hidden by default
	},
];
```

#### 3.2. Update IngredientGrid3 Props

**File:** `packages/web-frontend/src/app/pages/ingredients3/IngredientGrid3.tsx`

```typescript
export interface IngredientGrid3Props {
	// NEW: Accept field configuration
	fields?: Table2Column<Ingredient>[];
	// ... existing props
}

export function IngredientGrid3({ fields = INGREDIENT_GRID_FIELDS, ...props }: IngredientGrid3Props) {
	// Pass fields to card rendering logic
	// ...
}
```

#### 3.3. Update IngredientCard3

**File:** Create or update `packages/web-frontend/src/app/pages/ingredients3/IngredientCard3.tsx`

```typescript
interface IngredientCard3Props {
  ingredient: Ingredient;
  fields: Table2Column<Ingredient>[]; // Fields to display
  onEdit?: (ingredient: Ingredient) => void;
  onDelete?: (id: string) => void;
}

export function IngredientCard3({ ingredient, fields, onEdit, onDelete }: IngredientCard3Props) {
  return (
    <div className="...">
      {/* Name is always shown as title (not in fields list, or filtered out) */}
      <h3>{ingredient.name}</h3>

      {/* Render fields dynamically based on configuration */}
      <div className="...">
        {fields
          .filter(f => f.key !== 'name') // Skip name (already rendered as title)
          .map(field => (
            <div key={field.key} className="...">
              <span className="label">{field.label}:</span>
              <span className="value">{field.render(ingredient)}</span>
            </div>
          ))}
      </div>

      {/* Actions */}
      <div className="...">
        {onEdit && <Button onClick={() => onEdit(ingredient)}>Edit</Button>}
        {onDelete && <Button onClick={() => onDelete(ingredient.id)}>Delete</Button>}
      </div>
    </div>
  );
}
```

#### 3.4. Add Feature to Page

**File:** `packages/web-frontend/src/app/pages/ingredients3/Ingredients3GridPage.tsx`

Same pattern as Ingredients2Page:

```typescript
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import {
  toColumnVisibilityDefs,
  extractColumnIds,
  extractDefaultVisible,
  extractCanHideConstraints,
  applyColumnVisibility,
  applyColumnOrder,
} from '@framework/utils2/Table2ColumnConfig';
import { INGREDIENT_GRID_FIELDS } from './IngredientGrid3';

// Field visibility hook (using columnVisibility hook)
const fieldVisibility = useColumnVisibility(
  extractColumnIds(INGREDIENT_GRID_FIELDS),
  {
    storageId: STORAGE_ID + '-fields', // Different storage key
    defaultVisible: extractDefaultVisible(INGREDIENT_GRID_FIELDS),
    constraints: extractCanHideConstraints(INGREDIENT_GRID_FIELDS),
  }
);

// Field ordering hook (with canReorder constraints)
const fieldOrder = useColumnOrder({
  storageId: STORAGE_ID + '-fields',
  defaultOrder: extractColumnIds(INGREDIENT_GRID_FIELDS),
  constraints: extractCanReorderConstraints(INGREDIENT_GRID_FIELDS), // NEW
});

// Apply visibility + ordering to fields
const visibleOrderedFields = useMemo(() => {
  let fields = INGREDIENT_GRID_FIELDS;
  fields = applyColumnVisibility(fields, fieldVisibility.visibleColumns);
  fields = applyColumnOrder(fields, fieldOrder.columnOrder);
  return fields;
}, [fieldVisibility.visibleColumns, fieldOrder.columnOrder]);

// In header JSX (change label to "Fields" instead of "Columns"):
<ColumnVisibility
  label="Fields"  // Different label for grid context
  columns={toColumnVisibilityDefs(INGREDIENT_GRID_FIELDS)}
  visibleColumns={fieldVisibility.visibleColumns}
  defaultVisible={new Set(extractDefaultVisible(INGREDIENT_GRID_FIELDS))}
  onToggle={fieldVisibility.toggleColumn}
  onReset={() => {
    fieldVisibility.resetColumns();
    fieldOrder.resetOrder();
  }}
  onShowAll={fieldVisibility.showAll}
  onHideAll={fieldVisibility.hideAll}
  isColumnModified={fieldVisibility.isColumnModified}
  onResetColumn={fieldVisibility.resetColumn}
  columnOrder={fieldOrder.columnOrder}
  defaultOrder={extractColumnIds(INGREDIENT_GRID_FIELDS)}
  onReorderColumns={fieldOrder.reorderColumns}
  isColumnModifiedOrder={fieldOrder.isColumnModified}
  onResetColumnOrder={fieldOrder.resetColumn}
/>

// Pass to grid:
<Data2 ...>
  <IngredientGrid3
    fields={visibleOrderedFields}  // NEW
    onEdit={handleEdit}
    onDelete={handleDelete}
  />
</Data2>
```

---

## Files Summary

### CREATE (1 file):

1. `packages/web-frontend/src/framework/utils2/Table2ColumnConfig.ts` - Utility functions for Table2Column

### MODIFY (7-8 files):

**Framework level (v1 hooks - NEW FEATURE):**

1. `packages/web-frontend/src/framework/components/columns/useColumnOrder.ts` - Add `canReorder` constraint support

**Framework level (v2 components):** 2. `packages/web-frontend/src/framework/components2/table/Table2.tsx` - Extend interface with `canReorder`

**Ingredients2 (Table2):** 3. `packages/web-frontend/src/app/pages/ingredients2/IngredientTable2.tsx` - Add metadata (canReorder), accept columns prop 4. `packages/web-frontend/src/app/pages/ingredients2/Ingredients2Page.tsx` - Add hooks and button with constraints

**Ingredients3 (Grid3):** 5. `packages/web-frontend/src/app/pages/ingredients3/IngredientGrid3.tsx` - Define fields with canReorder, accept fields prop 6. `packages/web-frontend/src/app/pages/ingredients3/Ingredients3GridPage.tsx` - Add hooks and button with constraints 7. `packages/web-frontend/src/app/pages/ingredients3/IngredientCard3.tsx` - Render fields dynamically (create if doesn't exist)

---

## Testing Checklist

### Table2 (Ingredients2Page):

- [ ] Column visibility toggle (show/hide individual columns)
- [ ] Column ordering (drag & drop)
- [ ] Show All / Hide All buttons
- [ ] Reset to Default button
- [ ] Individual column reset buttons
- [ ] localStorage persistence (refresh page, settings preserved)
- [ ] Constraints (canHide: false for 'name' column)
- [ ] **NEW: Constraints (canReorder: false for 'name' column - cannot be dragged)**
- [ ] Default visibility (ID hidden by default)
- [ ] Badge shows correct count (e.g., "8/9" if ID is hidden)

### Grid3 (Ingredients3GridPage):

- [ ] Field visibility toggle (show/hide individual fields in cards)
- [ ] Field ordering (drag & drop affects field display order in cards)
- [ ] Show All / Hide All buttons
- [ ] Reset to Default button
- [ ] Individual field reset buttons
- [ ] localStorage persistence (separate from Table2)
- [ ] Constraints (canHide: false for 'name' field - always visible as card title)
- [ ] **NEW: Constraints (canReorder: false for 'name' field - cannot be dragged, always first)**
- [ ] Default visibility (ID, createdAt, updatedAt hidden by default)
- [ ] Label says "Fields" not "Columns"

### Cross-cutting:

- [ ] No code duplication between Table2 and Grid3 implementations
- [ ] Same UI/UX as v1 (ColumnVisibility component)
- [ ] Backward compatibility (Table2/Grid3 work without feature)
- [ ] No breaking changes to existing code

---

## Key Design Principles

1. **Reuse everything from v1** - ColumnVisibility, hooks, utilities pattern
2. **Page-level composition** - Feature logic in pages, not in components
3. **Zero duplication** - Same utilities work for both Table2 and Grid3
4. **Backward compatible** - Table2/Grid3 continue to work as before
5. **Type-safe** - Leverage TypeScript generics (`Table2Column<T>`)
6. **Single source of truth** - Column/field definitions are the source of metadata

---

## Implementation Notes

- **Antifragilité:** Ce nouveau cas d'usage (Grid3) a révélé le besoin d'une nouvelle fonctionnalité `canReorder: false` qui améliore le système existant. Cette contrainte sera ajoutée à `useColumnOrder` hook et bénéficiera aussi à tous les futurs usages.
- The "bricolage" aspect for Grid3: Using `Table2Column<T>` interface for field definitions even though it's not a table. This maximizes code reuse and allows using the same utilities.
- The `name` field in Grid3 is protected with BOTH `canHide: false` AND `canReorder: false` - it's always visible as the card title and always appears first.
- Grid3 uses label "Fields" instead of "Columns" for better UX.
- Both pages use separate `storageId` keys to avoid conflicts in localStorage.
- `defaultVisible` defaults to `true` (opposite of v1), so columns/fields are visible unless explicitly marked `defaultVisible: false`.
- **NEW FEATURE:** `canReorder: false` prevents a column/field from being reordered via drag & drop. The drag handle should be disabled or not shown for these items in the UI.

---

**END OF PLAN**
