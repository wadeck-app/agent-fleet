/**
 * ===========================================================================================
 * S_2TABLES: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Two separate DataTables on the same page with completely independent state.
 * Each table has its own pagination, search, and query state.
 *
 * Table 1 (All Products):
 * - All products with pagination + search
 * - 10 items per page
 *
 * Table 2 (Recent Products):
 * - Products sorted by createdAt desc
 * - 5 items per page
 *
 * The two tables share NO state -- completely independent queries/pagination/search.
 *
 * ===========================================================================================
 */
import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetDataTable } from '../_framework/WidgetDataTable';

const columns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

const recentProductsService = {
	getProducts: async (params?: {
		search?: string;
		page?: number;
		pageSize?: number;
		sortBy?: string;
		sortOrder?: string;
	}) => {
		const result = await productsService.getProducts({
			...params,
			sortBy: 'createdAt',
			sortOrder: 'desc',
		});
		return result;
	},
	createProduct: productsService.createProduct.bind(productsService),
	updateProduct: productsService.updateProduct.bind(productsService),
	deleteProduct: productsService.deleteProduct.bind(productsService),
	bulkDeleteProducts: productsService.bulkDeleteProducts.bind(productsService),
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
						<WidgetDataTable
							service={productsService}
							columns={columns}
							features={['search', { type: 'pagination', pageSizes: [10, 20, 50] }]}
						/>
					</PageLayout>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Products</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<WidgetDataTable
							service={recentProductsService}
							columns={columns}
							features={[{ type: 'pagination', pageSizes: [5, 10, 20] }]}
						/>
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
