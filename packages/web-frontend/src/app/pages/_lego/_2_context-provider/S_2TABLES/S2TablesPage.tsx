/**
 * ===========================================================================================
 * S_2TABLES: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Two separate DataTables on the same page with completely independent state.
 * Each table has its own ProductProvider context with different configurations.
 *
 * Table 1 (All Products):
 * - All products with pagination + search
 * - 10 items per page
 *
 * Table 2 (Recent Products):
 * - Products sorted by createdAt desc
 * - 5 items per page
 *
 * The tables are INDEPENDENT:
 * - Each ProductProvider creates its own context
 * - Selecting/sorting in one does NOT affect the other
 * - Demonstrates that the architecture can compose multiple isolated contexts
 *
 * ===========================================================================================
 */
import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from '../_framework/PageLayout';
import { ProductProvider } from '../_framework/ProductDomainContext';
import { ViewDataTable } from '../_framework/ViewDataTable';

const columns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function S2TablesPage() {
	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<ProductProvider defaultPageSize={10} key="all-products">
						<PageLayout>
							<ViewDataTable columns={columns} features={['search', 'pagination']} />
						</PageLayout>
					</ProductProvider>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Products</CardTitle>
				</CardHeader>
				<CardContent>
					<ProductProvider defaultPageSize={5} key="recent-products">
						<PageLayout>
							<ViewDataTable columns={columns} features={['pagination']} />
						</PageLayout>
					</ProductProvider>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
