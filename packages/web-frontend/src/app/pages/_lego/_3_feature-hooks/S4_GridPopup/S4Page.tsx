import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookItemGrid, PageLayout, useCrudFeature, usePaginationFeature } from '../_framework';

/**
 * ===========================================================================================
 * S4: GRID WITH POPUP (Hook Approach)
 * ===========================================================================================
 *
 * Grid-based data display with CRUD operations.
 * Demonstrates grid layout with create/edit/delete functionality.
 *
 * Features:
 * - pagination
 * - crud (create/edit/delete via dialog)
 *
 * Architecture:
 * - Page creates pagination + crud hooks
 * - Widget renders items in grid layout
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
	const pagination = usePaginationFeature({ defaultSize: 12 });
	const crud = useCrudFeature(ProductDialogAdapter);

	return (
		<PageLayout>
			<HookItemGrid service={productsService} columns={columns} features={[pagination, crud]} />
		</PageLayout>
	);
}
