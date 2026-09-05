import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';
import { SplitLayout } from '../_framework/SplitLayout';

/**
 * ===========================================================================================
 * S7: MASTER-DETAIL NAVIGATOR
 * ===========================================================================================
 *
 * Master-detail layout with URL-synced selection and prev/next navigation.
 * Demonstrates compound component pattern with automatic context sharing.
 *
 * Features:
 * - Click row to select
 * - URL sync (?id=xxx)
 * - Prev/next navigation within current page
 * - Compound component architecture
 *
 * ===========================================================================================
 */

const tableColumns = [
	col.text<Product>('name', 'Name', { sortable: true }),
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
	col.number<Product>('rating', 'Rating', { suffix: ' / 5' }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S7Page() {
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
					right={<DataTable.DetailPanel columns={detailColumns} />}
					rightWidth="md"
				/>
			</DataTable>
		</PageLayout>
	);
}
