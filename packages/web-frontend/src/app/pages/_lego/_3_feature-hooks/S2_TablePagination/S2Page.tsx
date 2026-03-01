import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable, PageLayout, usePaginationFeature } from '../_framework';

/**
 * ===========================================================================================
 * S2: TABLE WITH PAGINATION (Hook Approach)
 * ===========================================================================================
 *
 * Data table with pagination enabled.
 * Demonstrates single feature composition.
 *
 * Features:
 * - pagination
 *
 * Architecture:
 * - Page creates pagination hook
 * - Widget receives hook instance and uses its state
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
];

export function S2Page() {
	const pagination = usePaginationFeature({ defaultSize: 10 });

	return (
		<PageLayout>
			<HookDataTable service={productsService} columns={columns} features={[pagination]} />
		</PageLayout>
	);
}
