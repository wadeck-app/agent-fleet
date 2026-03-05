import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineDataTable } from '../_framework/PipelineDataTable';

/**
 * ===========================================================================================
 * S1: SIMPLE TABLE (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Minimalist data table with no features.
 * Demonstrates the query-pipeline pattern with zero modifiers.
 *
 * Architecture:
 * - No modifiers = empty query
 * - Service fetches all data
 * - Pure render with no state
 *
 * Features: none
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S1Page() {
	return (
		<PageLayout>
			<PipelineDataTable service={productsService} columns={columns} modifiers={[]}>
				<div className="flex h-full flex-col gap-4">
					<PipelineBody />
				</div>
			</PipelineDataTable>
		</PageLayout>
	);
}
