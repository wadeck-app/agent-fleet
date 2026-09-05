import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { SplitLayout } from '../_framework/SplitLayout';
import { WidgetDataTable } from '../_framework/WidgetDataTable';
import { WidgetDetailPanel } from '../_framework/WidgetDetailPanel';

/**
 * ===========================================================================================
 * S7: MASTER-DETAIL NAVIGATOR
 * ===========================================================================================
 *
 * Master-detail layout with URL-synced selection and prev/next navigation.
 * Demonstrates event bus communication between table and detail panel.
 *
 * Features:
 * - Click row to select
 * - URL sync (?id=xxx)
 * - Prev/next navigation within current page
 * - Event bus for widget communication
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
		<SplitLayout
			left={
				<WidgetDataTable
					service={productsService}
					columns={tableColumns}
					features={['pagination']}
					emits={['product:selected']}
				/>
			}
			right={
				<WidgetDetailPanel
					service={productsService}
					columns={detailColumns}
					features={[]}
					listens={['product:selected']}
				/>
			}
			rightWidth="md"
		/>
	);
}
