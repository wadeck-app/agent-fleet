import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
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
 * S9: TWO INDEPENDENT TABLES (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Two separate PipelineDataTable instances on the same page:
 * - Table 1: All products with all columns
 * - Table 2: Featured products only (filtered client-side) with all columns
 *
 * The tables are INDEPENDENT:
 * - Each has its own PipelineContext (separate data fetching)
 * - Selecting/sorting in one does NOT affect the other
 * - Demonstrates that the architecture can compose multiple isolated contexts
 *
 * Architecture:
 * - Two PipelineDataTable components with different services
 * - Featured service wraps productsService and filters by featured flag
 * - Each table has its own pagination state
 *
 * Features:
 * - Two independent tables
 * - Pagination (10 items per page)
 * - Featured products filter
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
	col.date<Product>('createdAt', 'Created'),
];

const featuredService = {
	getProducts: async (params?: any) => {
		const result = await productsService.getProducts(params);
		return {
			...result,
			items: result.items.filter(p => p.featured),
		};
	},
};

export function S9Page() {
	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<PipelineDataTable
							service={productsService}
							columns={columns}
							modifiers={[withPagination(1, 10)]}
						>
							<PipelineContent>
								<PipelineBody showPagination />
							</PipelineContent>
						</PipelineDataTable>
					</PageLayout>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Featured Products Only</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<PipelineDataTable
							service={featuredService}
							columns={columns}
							modifiers={[withPagination(1, 10)]}
						>
							<PipelineContent>
								<PipelineBody showPagination />
							</PipelineContent>
						</PipelineDataTable>
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
