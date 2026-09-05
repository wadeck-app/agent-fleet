import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { withPagination } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S2: TABLE WITH PAGINATION (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Data table with pagination.
 * Demonstrates the query-pipeline pattern with pagination modifier.
 *
 * Architecture:
 * - withPagination(1, 10) modifier provides initial pagination state
 * - PipelineBody's showPagination prop enables pagination controls
 * - Page changes trigger modifier override and re-fetch
 *
 * Features:
 * - pagination
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

export function S2Page() {
	return (
		<PageLayout>
			<PipelineDataTable service={productsService} columns={columns} modifiers={[withPagination(1, 10)]}>
				<PipelineContent>
					<PipelineBody showPagination />
				</PipelineContent>
			</PipelineDataTable>
		</PageLayout>
	);
}
