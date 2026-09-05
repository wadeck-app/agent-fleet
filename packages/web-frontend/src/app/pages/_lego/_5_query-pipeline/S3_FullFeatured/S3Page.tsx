import { useMemo } from 'react';

import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';
import { withPagination, withSearch } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S3: FULL-FEATURED TABLE (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Complete data table with features via query modifiers.
 * Demonstrates the query-pipeline pattern with composed modifiers.
 *
 * Architecture:
 * - Modifiers are composed in array: [withSearch, withPagination, ...]
 * - Each modifier is a pure function: (query) => newQuery
 * - Final query is built by applying modifiers sequentially
 * - Data is fetched with the final query
 *
 * Features:
 * - search (via withSearch modifier)
 * - pagination (via withPagination modifier)
 *
 * Note: Full CRUD, sorting, column-visibility would require additional modifiers
 * and interactive components. This demo shows the core pattern.
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.number<Product>('rating', 'Rating', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function S3Page() {
	const modifiers = useMemo(() => [withSearch(''), withPagination(1, 10)], []);

	return (
		<PageLayout>
			<PipelineDataTable service={productsService} columns={columns} modifiers={modifiers}>
				<PipelineContent>
					<PipelineToolbar>
						<PipelineSearch />
					</PipelineToolbar>
					<PipelineBody showPagination />
				</PipelineContent>
			</PipelineDataTable>
		</PageLayout>
	);
}
