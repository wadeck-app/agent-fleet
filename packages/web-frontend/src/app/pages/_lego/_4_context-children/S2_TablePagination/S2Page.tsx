import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S2: TABLE WITH PAGINATION
 * ===========================================================================================
 *
 * Data table with pagination controls.
 * Demonstrates adding features via compound component composition.
 *
 * Features: pagination
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
			<DataTable service={productsService} columns={columns}>
				<DataTable.ContentList>
					<DataTable.Body />
					<DataTable.Footer>
						<DataTable.Pagination defaultSize={10} />
					</DataTable.Footer>
				</DataTable.ContentList>
			</DataTable>
		</PageLayout>
	);
}
