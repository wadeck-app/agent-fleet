import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S1: SIMPLE TABLE
 * ===========================================================================================
 *
 * Minimalist data table with no features.
 * Demonstrates compound component pattern with minimal composition.
 *
 * Features: none
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

const readOnlyService = {
	getProducts: productsService.getProducts,
};

export function S1Page() {
	return (
		<PageLayout>
			<DataTable service={readOnlyService} columns={columns}>
				<DataTable.Content>
					<DataTable.Body />
				</DataTable.Content>
			</DataTable>
		</PageLayout>
	);
}
