import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout, WidgetDataTable } from '../_framework';

/**
 * ===========================================================================================
 * S3: FULL-FEATURED TABLE
 * ===========================================================================================
 *
 * Complete data table with all features enabled.
 * Demonstrates the full power of the Lego framework.
 *
 * Features:
 * - search
 * - pagination
 * - sorting (multi-column)
 * - column-visibility
 * - bulk-delete
 * - crud (create/read/update/delete)
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
		<PageLayout>
			<WidgetDataTable
				service={productsService}
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
	);
}
