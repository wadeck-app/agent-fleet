# Lego Framework - Approach 2: Context-Provider

## Overview

This implementation demonstrates the **Context-Provider** pattern where a Provider (Context) owns ALL state and View components read from Context with zero data props, zero service dependencies, and zero fetch logic.

## Key Principles

1. **Context Owns State**: All data, loading, error, pagination, and query state lives in the Provider
2. **Views Are Pure Readers**: ViewDataTable, ViewItemGrid, etc. only read from context via `useProductDomain()`
3. **Actions Through Context**: CRUD operations are exposed as `context.actions.*`
4. **Implicit Communication**: Cross-widget communication happens automatically through shared context (no event bus needed)

## Architecture

### Core Framework

- **`DomainContext.ts`**: Generic factory for creating type-safe domain contexts
- **`ProductDomainContext.tsx`**: Product-specific provider that manages all state and business logic
- **`ViewDataTable.tsx`**: Table view component (reads from context)
- **`ViewItemGrid.tsx`**: Grid view component (reads from context)
- **`ViewCarousel.tsx`**: Carousel view component (reads from context)
- **`ViewDetailPanel.tsx`**: Detail panel component (reads from context)
- **`SelectableViewDataTable.tsx`**: Extension of ViewDataTable with row selection for master-detail
- **`ProductDialogAdapter.tsx`**: Adapter to bridge ProductDialog with CrudDialogProps interface
- **`PageLayout.tsx`**: Simple page wrapper
- **`SplitLayout.tsx`**: Two-column layout for master-detail

### Scenario Pages

All pages demonstrate zero className, zero inline styles, zero hooks, zero state — pure composition.

1. **S1_SimpleTable**: Basic read-only table
2. **S2_TablePagination**: Table with pagination and column reordering
3. **S3_FullFeatured**: Full CRUD with search, sorting, column visibility, bulk delete
4. **S4_GridPopup**: Grid layout with CRUD dialog
5. **S5_Carousel**: Single-item carousel with field visibility toggles
6. **S6_ItemDetail**: Master-detail view (table + detail panel with inline edit)

## Usage Example

```tsx
import { col } from '@framework/lego/helpers/col';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from './_framework/PageLayout';
import { ProductProvider } from './_framework/ProductDomainContext';
import { ViewDataTable } from './_framework/ViewDataTable';

const columns = [
	col.text('name', 'Name', { sortable: true }),
	col.number('price', 'Price', { prefix: '$' }),
	col.enum('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
];

export function MyPage() {
	return (
		<ProductProvider>
			<PageLayout>
				<ViewDataTable columns={columns} features={['search', 'pagination']} />
			</PageLayout>
		</ProductProvider>
	);
}
```

## Benefits

- **Minimal Page Code**: Pages are just composition of Provider + Views
- **Automatic Reactivity**: All views react to context changes automatically
- **No Prop Drilling**: No need to pass data/actions through props
- **Type-Safe**: Full TypeScript support with generics
- **Cross-Widget Communication**: S6 demonstrates how table selection automatically updates detail panel

## Comparison to Approach 1

- **Approach 1 (Widget-Service)**: Each widget receives service prop and manages own state
- **Approach 2 (Context-Provider)**: Single provider owns all state, widgets are pure readers

Approach 2 is better for scenarios with multiple interconnected views (like master-detail) where implicit state sharing is valuable.

## Storybook

All scenario pages have corresponding `.stories.tsx` files demonstrating the functionality in isolation.

## Testing

Run type checks:

```bash
npm run check:ts
```

Build verification:

```bash
npm run build
```

Runtime verification:

```bash
npm run dev
# Navigate to /lego-2-context-provider/* pages
```
