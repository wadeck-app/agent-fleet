import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';
import { S4Content } from './S4Content';

/**
 * ===========================================================================================
 * S4: GRID POPUP
 * ===========================================================================================
 *
 * Items displayed as a CSS grid of cards with search, pagination, and CRUD via dialog.
 * Uses DataTable.Grid (card grid) + DataTable.GridFooter instead of DataTable.Body (table).
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
			<DataTable service={productsService} columns={columns} enableCrud={true}>
				<S4Content />
			</DataTable>
		</PageLayout>
	);
}
