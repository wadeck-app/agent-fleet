import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S5: CAROUSEL (SIMPLIFIED)
 * ===========================================================================================
 *
 * Simplified implementation using DataTable.
 * Full Carousel compound component would follow the same pattern.
 *
 * Features:
 * - pagination (for carousel navigation)
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
];

export function S5Page() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={columns} defaultPageSize={1}>
				<DataTable.ContentList>
					<DataTable.Body />
					<DataTable.Footer>
						<DataTable.Pagination defaultSize={1} pageSizes={[1]} />
					</DataTable.Footer>
				</DataTable.ContentList>
			</DataTable>
		</PageLayout>
	);
}
