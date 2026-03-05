/**
 * ===========================================================================================
 * S_BUS: EVENT BUS SELECTION WITH URL SYNC
 * ===========================================================================================
 *
 * Split layout with event bus communication between table and detail panel.
 * Row selection synced to URL query parameter (?id=xxx).
 * Re-clicking the same row refreshes the detail panel.
 *
 * Features:
 * - Click row to select → detail panel shows item details
 * - Selected item ID synced to URL: ?id=xxx
 * - Event bus for widget communication
 * - Re-clicking selected row reloads detail panel
 *
 * Note: WidgetDetailPanel has built-in prev/next navigation buttons.
 *
 * ===========================================================================================
 */
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { SplitLayout } from '../_framework/SplitLayout';
import { WidgetDataTable } from '../_framework/WidgetDataTable';
import { WidgetDetailPanel } from '../_framework/WidgetDetailPanel';

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

export function SBusPage() {
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
