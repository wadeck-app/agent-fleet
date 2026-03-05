import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from '../_framework/PageLayout';
import { ProductProvider } from '../_framework/ProductDomainContext';
import { ViewDataTable } from '../_framework/ViewDataTable';

/**
 * ===========================================================================================
 * S9: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Two separate DataTables on the same page:
 * - Table 1: All products with all columns
 * - Table 2: Featured products only (filtered via ProductProvider featuredOnly prop)
 *
 * The tables are INDEPENDENT:
 * - Each provider creates its own context
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

export function S9Page() {
	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<ProductProvider>
						<PageLayout>
							<ViewDataTable columns={columns} features={['pagination']} />
						</PageLayout>
					</ProductProvider>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Featured Products Only</CardTitle>
				</CardHeader>
				<CardContent>
					<ProductProvider featuredOnly>
						<PageLayout>
							<ViewDataTable columns={columns} features={['pagination']} />
						</PageLayout>
					</ProductProvider>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
