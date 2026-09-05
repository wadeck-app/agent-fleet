/**
 * ===========================================================================================
 * S_BUS: EVENT BUS SELECTION WITH URL SYNC
 * ===========================================================================================
 *
 * Split layout with context-based communication between table and detail panel.
 * Row selection synced to URL query parameter (?id=xxx).
 * Re-clicking the same row refreshes the detail panel.
 *
 * Features:
 * - Click row to select → detail panel shows item details
 * - Selected item ID synced to URL: ?id=xxx
 * - Context-based state management
 * - Re-clicking selected row reloads detail panel
 *
 * Note: ViewDetailPanelNav has built-in prev/next navigation buttons.
 *
 * ===========================================================================================
 */
import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductProvider } from '../_framework/ProductDomainContext';
import { SelectableViewDataTable } from '../_framework/SelectableViewDataTable';
import { SplitLayout } from '../_framework/SplitLayout';
import { ViewDetailPanelNav } from '../_framework/ViewDetailPanelNav';

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
		<ProductProvider>
			<SplitLayout
				left={<SelectableViewDataTable columns={tableColumns} features={['pagination']} />}
				right={<ViewDetailPanelNav columns={detailColumns} />}
				rightWidth="md"
			/>
		</ProductProvider>
	);
}
