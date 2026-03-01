import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable, PageLayout } from '../_framework';

/**
 * ===========================================================================================
 * S4: GRID POPUP (SIMPLIFIED)
 * ===========================================================================================
 *
 * Simplified implementation using DataTable.
 * Full ItemGrid compound component would follow the same pattern.
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
			<DataTable service={productsService} columns={columns}>
				<div className="flex h-full flex-col gap-4">
					<DataTable.Toolbar>
						<DataTable.Search />
						<DataTable.CreateButton dialog={ProductDialogAdapter} />
					</DataTable.Toolbar>
					<DataTable.Body />
					<DataTable.Footer>
						<DataTable.Pagination defaultSize={12} />
					</DataTable.Footer>
					<DataTable.Dialog dialog={ProductDialogAdapter} />
				</div>
			</DataTable>
		</PageLayout>
	);
}
