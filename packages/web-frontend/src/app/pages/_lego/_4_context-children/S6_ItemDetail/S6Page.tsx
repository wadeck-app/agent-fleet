import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { DetailPanel } from '../_framework/DetailPanel';
import { PageLayout } from '../_framework/PageLayout';
import { SplitLayout } from '../_framework/SplitLayout';

/**
 * ===========================================================================================
 * S6: ITEM DETAIL (SPLIT LAYOUT)
 * ===========================================================================================
 *
 * Split layout with master table and detail panel.
 * Uses onRowClick callback to lift selected ID up.
 *
 * Features:
 * - row selection via click
 * - detail view
 * - pagination
 *
 * ===========================================================================================
 */

const tableColumns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
];

const detailColumns = [
	col.text<Product>('name', 'Name'),
	col.text<Product>('description', 'Description'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.number<Product>('stock', 'Stock'),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('rating', 'Rating'),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S6Page() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={tableColumns}>
				<SplitLayout
					left={
						<DataTable.Content>
							<DataTable.Body />
							<DataTable.Footer>
								<DataTable.Pagination defaultSize={10} />
							</DataTable.Footer>
						</DataTable.Content>
					}
					right={<DetailPanel<Product> columns={detailColumns} />}
					rightWidth="md"
				/>
			</DataTable>
		</PageLayout>
	);
}
