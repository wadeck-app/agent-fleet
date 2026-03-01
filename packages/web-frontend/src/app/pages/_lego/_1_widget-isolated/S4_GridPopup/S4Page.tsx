import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout, WidgetItemGrid } from '../_framework';

/**
 * ===========================================================================================
 * S4: ITEM GRID WITH POPUP CRUD
 * ===========================================================================================
 *
 * Responsive grid layout with search, pagination, and CRUD operations.
 * Demonstrates the WidgetItemGrid component.
 *
 * Features:
 * - search
 * - pagination
 * - crud (via popup dialog)
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
		<PageLayout>
			<WidgetItemGrid
				service={productsService}
				columns={columns}
				features={['search', 'pagination', { type: 'crud', dialog: ProductDialogAdapter }]}
			/>
		</PageLayout>
	);
}
