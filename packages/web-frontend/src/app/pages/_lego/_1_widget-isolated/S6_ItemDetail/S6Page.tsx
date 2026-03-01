import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { SplitLayout, WidgetDataTable, WidgetDetailPanel } from '../_framework';

/**
 * ===========================================================================================
 * S6: ITEM DETAIL PANEL
 * ===========================================================================================
 *
 * Split-panel layout with event-driven communication.
 * Left: data table (emits 'product:selected')
 * Right: detail panel (listens for 'product:selected')
 *
 * Features:
 * - Cross-widget communication via event bus
 * - Split-panel responsive layout
 * - Inline editing in detail panel
 *
 * Events:
 * - 'product:selected': { id: string }
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
		<SplitLayout>
			<div className="flex-1">
				<WidgetDataTable
					service={productsService}
					columns={tableColumns}
					features={['pagination']}
					emits={['product:selected']}
				/>
			</div>
			<div className="w-96">
				<WidgetDetailPanel
					service={productsService}
					columns={detailColumns}
					features={['inline-edit']}
					listens={['product:selected']}
				/>
			</div>
		</SplitLayout>
	);
}
