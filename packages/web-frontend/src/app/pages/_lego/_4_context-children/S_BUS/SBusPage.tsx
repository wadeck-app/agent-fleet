import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';
import { SBusContent } from './SBusContent';

/**
 * ===========================================================================================
 * S_BUS: EVENT BUS SELECTION WITH URL SYNC
 * ===========================================================================================
 *
 * Features: click row to select, URL sync, keyboard navigation
 *
 * ===========================================================================================
 */

const tableColumns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
];

export function SBusPage() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={tableColumns}>
				<SBusContent />
			</DataTable>
		</PageLayout>
	);
}
