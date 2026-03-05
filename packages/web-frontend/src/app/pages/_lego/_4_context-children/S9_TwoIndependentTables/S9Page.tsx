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
 * S9: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Two separate DataTables on the same page:
 * - Table 1: All products with all columns
 * - Table 2: Featured products only (filtered via separate service)
 *
 * The tables are INDEPENDENT:
 * - Each DataTable creates its own context
 * - Selecting/sorting in one does NOT affect the other
 * - Demonstrates that the architecture can compose multiple isolated contexts
 *
 * Layout: Stacked vertically (two cards using PageContainer)
 *
 * Features: Basic table with pagination
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
			totalCount: result.items.filter(p => p.featured).length,
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
						<DataTable service={productsService} columns={columns}>
							<DataTable.Content>
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
					<CardTitle>Featured Products Only</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<DataTable service={featuredService} columns={columns}>
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
