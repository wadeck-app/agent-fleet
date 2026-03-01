import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from '../_framework/PageLayout';
import { ProductProvider } from '../_framework/ProductDomainContext';
import { ViewDataTable } from '../_framework/ViewDataTable';

/**
 * ===========================================================================================
 * S1: SIMPLE TABLE
 * ===========================================================================================
 *
 * Scenario: Basic read-only table with no features.
 * Demonstrates the minimal setup with context provider pattern.
 *
 * Features: None
 * Columns: name, price, category, status, featured, createdAt
 *
 * Zero className, zero inline styles, zero hooks, zero state — pure composition.
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S1Page() {
	return (
		<ProductProvider>
			<PageLayout>
				<ViewDataTable columns={columns} features={[]} />
			</PageLayout>
		</ProductProvider>
	);
}
