import { useState } from 'react';

import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineDetailPanel } from '../_framework/PipelineDetailPanel';
import { withPagination } from '../_framework/PipelineTypes';
import { SplitLayout } from '../_framework/SplitLayout';

/**
 * ===========================================================================================
 * S6: ITEM DETAIL PANEL (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Split-panel layout with master-detail pattern.
 * Left: data table (emits selection via onRowClick)
 * Right: detail panel (receives selectedId prop)
 *
 * Architecture:
 * - No event bus — page-level state coordinates table + detail
 * - PipelineBody's onRowClick prop sets selectedId state
 * - PipelineDetailPanel receives selectedId and fetches item
 *
 * Features:
 * - Split-panel responsive layout
 * - Row click selection
 * - Detail panel with field display
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
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

	return (
		<SplitLayout
			left={
				<PipelineDataTable service={productsService} columns={tableColumns} modifiers={[withPagination(1, 10)]}>
					<PipelineContent>
						<PipelineBody showPagination onRowClick={item => setSelectedId(item.id)} showCursor />
					</PipelineContent>
				</PipelineDataTable>
			}
			right={<PipelineDetailPanel service={productsService} columns={detailColumns} selectedId={selectedId} />}
			rightWidth="md"
		/>
	);
}
