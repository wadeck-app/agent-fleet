import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductProvider } from '../_framework/ProductDomainContext';
import { SelectableViewDataTable } from '../_framework/SelectableViewDataTable';
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
 * When table selects a row via actions.select(), the detail panel
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
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
];

const detailColumns = [
	col.text<Product>('name', 'Name'),
	col.text<Product>('description', 'Description'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES),
	col.number<Product>('rating', 'Rating'),
	col.number<Product>('stock', 'Stock'),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
	col.date<Product>('updatedAt', 'Updated'),
];

export function S6Page() {
	return (
		<ProductProvider>
			<SplitLayout>
				<div className="flex-1">
					<SelectableViewDataTable columns={tableColumns} features={['pagination']} />
				</div>
				<div className="w-96">
					<ViewDetailPanel columns={detailColumns} features={['inline-edit']} />
				</div>
			</SplitLayout>
		</ProductProvider>
	);
}
