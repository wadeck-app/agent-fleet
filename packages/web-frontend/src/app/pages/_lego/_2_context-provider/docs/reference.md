# Reference

_Moved from README -- see [README](../README.md) for the overview._

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
