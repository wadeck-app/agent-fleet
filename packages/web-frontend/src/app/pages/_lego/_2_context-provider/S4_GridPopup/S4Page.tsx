import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from '../_framework/PageLayout';
import { ProductDialogAdapter } from '../_framework/ProductDialogAdapter';
import { ProductProvider } from '../_framework/ProductDomainContext';
import { ViewItemGrid } from '../_framework/ViewItemGrid';

/**
 * ===========================================================================================
 * S4: GRID VIEW WITH CRUD POPUP
 * ===========================================================================================
 *
 * Scenario: Grid layout with search, pagination, and CRUD dialog.
 * Demonstrates responsive card-based UI with popup editing.
 *
 * Features: search, pagination, CRUD dialog
 * Columns: name, price, category, status, rating
 *
 * Zero className, zero inline styles, zero hooks, zero state -- pure composition.
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
];

export function S4Page() {
	return (
		<ProductProvider>
			<PageLayout>
				<ViewItemGrid
					columns={columns}
					features={['search', 'pagination', { type: 'crud', dialog: ProductDialogAdapter }]}
				/>
			</PageLayout>
		</ProductProvider>
	);
}
