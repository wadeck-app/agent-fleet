import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
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
 * S_2TABLES: TWO INDEPENDENT TABLES (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Two separate PipelineDataTable instances on the same page with different configurations.
 *
 * Table 1 (top): All products with pagination (10 per page) + search
 * Table 2 (bottom): "Recent Products" -- products sorted by createdAt desc, pagination (5 per page)
 *
 * The tables are INDEPENDENT:
 * - Each has its own PipelineContext (separate data fetching)
 * - Searching/paginating one does NOT affect the other
 * - Demonstrates architecture can compose multiple isolated contexts
 *
 * Architecture:
 * - Two PipelineDataTable components with different modifiers
 * - Recent service wraps productsService and sorts by createdAt desc
 * - Each table has its own pagination + search state
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

const recentService = {
	getProducts: async (params?: any) => {
		const result = await productsService.getProducts(params);
		const sortedItems = [...result.items].sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
		const pageSize = params?.pageSize ?? 5;
		const page = params?.page ?? 1;
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const paginatedItems = sortedItems.slice(startIndex, endIndex);

		return {
			items: paginatedItems,
			pagination: {
				page,
				pageSize,
				total: sortedItems.length,
				totalPages: Math.ceil(sortedItems.length / pageSize),
			},
		};
	},
};

export function S2TablesPage() {
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
							modifiers={[withSearch(''), withPagination(1, 10)]}
						>
							<PipelineContent>
								<PipelineToolbar>
									<PipelineSearch />
								</PipelineToolbar>
								<PipelineBody showPagination />
							</PipelineContent>
						</PipelineDataTable>
					</PageLayout>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<PipelineDataTable service={recentService} columns={columns} modifiers={[withPagination(1, 5)]}>
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
