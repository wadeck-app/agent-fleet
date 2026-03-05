import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetDataTable } from '../_framework/WidgetDataTable';

/**
 * ===========================================================================================
 * S2: TABLE WITH PAGINATION
 * ===========================================================================================
 *
 * Data table with pagination and column reordering.
 * Demonstrates feature composition.
 *
 * Features:
 * - pagination
 * - column-reordering
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S2Page() {
	return (
		<PageLayout>
			<WidgetDataTable
				service={productsService}
				columns={columns}
				features={['pagination', 'column-reordering']}
			/>
		</PageLayout>
	);
}
