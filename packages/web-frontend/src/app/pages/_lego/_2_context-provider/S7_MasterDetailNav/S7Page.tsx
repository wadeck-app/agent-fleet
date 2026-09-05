import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductProvider } from '../_framework/ProductDomainContext';
import { SelectableViewDataTable } from '../_framework/SelectableViewDataTable';
import { SplitLayout } from '../_framework/SplitLayout';
import { ViewDetailPanelNav } from '../_framework/ViewDetailPanelNav';

/**
 * ===========================================================================================
 * S7: MASTER-DETAIL NAVIGATOR
 * ===========================================================================================
 *
 * Master-detail layout with URL-synced selection and prev/next navigation.
 * Provider owns all state, views read from context.
 *
 * Features:
 * - Click row to select
 * - URL sync (?id=xxx)
 * - Prev/next navigation within current page
 * - Context-based state management
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
		<ProductProvider>
			<SplitLayout
				left={<SelectableViewDataTable columns={tableColumns} features={['pagination']} />}
				right={<ViewDetailPanelNav columns={detailColumns} />}
				rightWidth="md"
			/>
		</ProductProvider>
	);
}
