import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineCarousel } from '../_framework/PipelineCarousel';
import { PipelineContent } from '../_framework/PipelineContent';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { withPagination } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S5: CAROUSEL (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Horizontal carousel with field visibility toggle and pagination.
 * Uses PipelineCarousel component to display items as scrollable cards.
 *
 * Architecture:
 * - PipelineDataTable provides context with pagination modifier (5 items per page)
 * - PipelineCarousel reads items from context and handles navigation
 * - Field visibility toggle is managed internally by carousel
 *
 * Features:
 * - Field visibility toggle (show/hide columns)
 * - Pagination (prev/next navigation, 5 items per page)
 * - Horizontal card layout
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('rating', 'Rating'),
];

export function S5Page() {
	return (
		<PageLayout>
			<PipelineDataTable service={productsService} columns={columns} modifiers={[withPagination(1, 5)]}>
				<PipelineContent>
					<PipelineCarousel />
				</PipelineContent>
			</PipelineDataTable>
		</PageLayout>
	);
}
