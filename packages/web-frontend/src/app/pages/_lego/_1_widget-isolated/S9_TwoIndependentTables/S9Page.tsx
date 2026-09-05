import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetDataTable } from '../_framework/WidgetDataTable';

/**
 * ===========================================================================================
 * S9: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Two separate DataTables on the same page:
 * - Table 1: All products with all columns
 * - Table 2: Featured products only (filtered client-side) with all columns
 *
 * The tables are INDEPENDENT:
 * - Each has its own PageEventContext (separate event buses)
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
						<WidgetDataTable service={productsService} columns={columns} features={['pagination']} />
					</PageLayout>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Featured Products Only</CardTitle>
				</CardHeader>
				<CardContent>
					<PageLayout>
						<WidgetDataTable service={featuredService} columns={columns} features={['pagination']} />
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
