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

All pages demonstrate zero className, zero inline styles, zero hooks, zero state -- pure composition.

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

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
