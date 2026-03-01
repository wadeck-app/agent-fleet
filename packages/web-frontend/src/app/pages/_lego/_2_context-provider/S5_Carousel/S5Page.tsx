import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { PageLayout } from '../_framework/PageLayout';
import { ProductProvider } from '../_framework/ProductDomainContext';
import { ViewCarousel } from '../_framework/ViewCarousel';

/**
 * ===========================================================================================
 * S5: CAROUSEL VIEW
 * ===========================================================================================
 *
 * Scenario: Single-item carousel with field visibility toggles and pagination.
 * Demonstrates focused item view with smooth navigation.
 *
 * Features: field-visibility, pagination
 * Columns: name, description, price, category, status, rating, stock, featured
 *
 * Zero className, zero inline styles, zero hooks, zero state — pure composition.
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.text<Product>('description', 'Description'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('rating', 'Rating'),
	col.number<Product>('stock', 'Stock'),
	col.boolean<Product>('featured', 'Featured'),
];

export function S5Page() {
	return (
		<ProductProvider>
			<PageLayout>
				<ViewCarousel columns={columns} features={[{ type: 'field-visibility' }, 'pagination']} />
			</PageLayout>
		</ProductProvider>
	);
}
