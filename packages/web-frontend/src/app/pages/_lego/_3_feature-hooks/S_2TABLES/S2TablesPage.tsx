import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable } from '../_framework/HookDataTable';
import { PageLayout } from '../_framework/PageLayout';
import { usePaginationFeature } from '../_framework/usePaginationFeature';
import { useSearchFeature } from '../_framework/useSearchFeature';

/**
 * ===========================================================================================
 * S_2TABLES: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Demonstrates two completely independent data tables on the same page.
 * Each table has its own state, queries, and pagination.
 *
 * Features:
 * - Table 1: All products (10 per page) with search
 * - Table 2: Recent products sorted by createdAt desc (5 per page)
 * - No shared state between tables
 *
 * Architecture:
 * - Two separate sets of feature hooks
 * - Two separate HookDataTable components
 * - Independent pagination and search state
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

const recentProductsService = {
	getProducts: async (params?: any) => {
		const result = await productsService.getProducts({
			...params,
			sortBy: 'createdAt',
			sortOrder: 'desc',
		});
		return result;
	},
};

export function S2TablesPage() {
	const search1 = useSearchFeature();
	const pagination1 = usePaginationFeature({ defaultSize: 10 });

	const pagination2 = usePaginationFeature({ defaultSize: 10, pageSizes: [5, 10, 20] });

	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<HookDataTable service={productsService} columns={columns} features={[search1, pagination1]} />
					</PageLayout>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<HookDataTable service={recentProductsService} columns={columns} features={[pagination2]} />
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
