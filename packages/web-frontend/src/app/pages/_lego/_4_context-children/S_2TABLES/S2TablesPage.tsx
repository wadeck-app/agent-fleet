import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S_2TABLES: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Demonstrates two completely independent data tables on the same page.
 * Each table has its own DataTable context and state.
 *
 * Features:
 * - Table 1: All products (10 per page) with search
 * - Table 2: Recent products sorted by createdAt desc (5 per page)
 * - No shared state between tables
 *
 * Architecture:
 * - Two separate DataTable components (each creates its own context)
 * - Independent pagination and search state
 * - Service wrapper for "Recent Products" with sorting
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('stock', 'Stock'),
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
	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<DataTable service={productsService} columns={columns}>
							<DataTable.Content>
								<DataTable.Toolbar>
									<DataTable.Search />
								</DataTable.Toolbar>
								<DataTable.Body />
								<DataTable.Footer>
									<DataTable.Pagination defaultSize={10} pageSizes={[10, 20, 50]} />
								</DataTable.Footer>
							</DataTable.Content>
						</DataTable>
					</PageLayout>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<DataTable service={recentProductsService} columns={columns}>
							<DataTable.Content>
								<DataTable.Body />
								<DataTable.Footer>
									<DataTable.Pagination defaultSize={5} pageSizes={[5, 10, 20]} />
								</DataTable.Footer>
							</DataTable.Content>
						</DataTable>
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
