import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from '../_framework/PageLayout';
import { ProductDialogAdapter } from '../_framework/ProductDialogAdapter';
import { ProductProvider } from '../_framework/ProductDomainContext';
import { ViewDataTable } from '../_framework/ViewDataTable';

/**
 * ===========================================================================================
 * S3: FULL-FEATURED TABLE
 * ===========================================================================================
 *
 * Scenario: Complete CRUD table with all features enabled.
 * Demonstrates the full power of the Lego framework.
 *
 * Features: search, pagination, multi-column sorting, column visibility, bulk delete, CRUD
 * Columns: name, price, category, status, rating, stock, featured, createdAt
 *
 * Zero className, zero inline styles, zero hooks, zero state — pure composition.
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.number<Product>('rating', 'Rating', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function S3Page() {
	return (
		<ProductProvider>
			<PageLayout>
				<ViewDataTable
					columns={columns}
					features={[
						'search',
						'pagination',
						{ type: 'sorting', multi: true },
						'column-visibility',
						'bulk-delete',
						{ type: 'crud', dialog: ProductDialogAdapter },
					]}
				/>
			</PageLayout>
		</ProductProvider>
	);
}
