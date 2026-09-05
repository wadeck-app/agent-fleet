import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';
import { S11Content } from './S11Content';

/**
 * ===========================================================================================
 * S11: THREE EDIT MODES
 * ===========================================================================================
 *
 * Features: search, pagination, sorting, column-visibility, bulk-delete, dynamic edit mode switching
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

export function S11Page() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={columns} enableSorting={true} enableCrud={true}>
				<S11Content />
			</DataTable>
		</PageLayout>
	);
}
