import { useState } from 'react';

import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable, HookDetailPanel, SplitLayout, usePaginationFeature } from '../_framework';

/**
 * ===========================================================================================
 * S6: ITEM DETAIL PANEL (Hook Approach)
 * ===========================================================================================
 *
 * Split-panel layout with callback-driven communication.
 * Left: data table (emits selection via callback)
 * Right: detail panel (receives selectedId via prop)
 *
 * Features:
 * - pagination (table)
 * - inline-edit (detail panel)
 *
 * Architecture:
 * - Page manages selected ID state
 * - Table calls onRowSelect callback
 * - Detail panel receives selectedId prop
 * - No event bus needed — direct prop/callback communication
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
	const pagination = usePaginationFeature({ defaultSize: 10 });
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

	return (
		<SplitLayout>
			<div className="flex-1">
				<HookDataTable
					service={productsService}
					columns={tableColumns}
					features={[pagination]}
					onRowSelect={setSelectedId}
				/>
			</div>
			<div className="w-96">
				<HookDetailPanel service={productsService} columns={detailColumns} selectedId={selectedId} />
			</div>
		</SplitLayout>
	);
}
