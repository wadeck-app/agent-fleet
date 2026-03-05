import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductProvider } from '../_framework/ProductDomainContext';
import { RowClickViewDataTable } from '../_framework/RowClickViewDataTable';
import { SplitLayout } from '../_framework/SplitLayout';
import { ViewDetailPanel } from '../_framework/ViewDetailPanel';

/**
 * ===========================================================================================
 * S6: MASTER-DETAIL VIEW
 * ===========================================================================================
 *
 * Scenario: Table on left, detail panel on right with inline editing.
 * Demonstrates cross-widget communication through shared context.
 *
 * Features:
 * - Table: pagination
 * - Detail Panel: inline-edit
 *
 * No events needed — both views share the same ProductProvider context.
 * When table row is clicked, it calls context.actions.selectItem(), and the detail panel
 * automatically reacts to context.selectedItem changes.
 *
 * Zero className, zero inline styles, zero hooks, zero state — pure composition.
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
	col.number<Product>('rating', 'Rating'),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S6Page() {
	return (
		<ProductProvider>
			<SplitLayout
				left={<RowClickViewDataTable columns={tableColumns} features={['pagination']} />}
				right={<ViewDetailPanel columns={detailColumns} features={['inline-edit']} />}
				rightWidth="md"
			/>
		</ProductProvider>
	);
}
