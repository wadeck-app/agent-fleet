import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookCarousel } from '../_framework/HookCarousel';
import { PageLayout } from '../_framework/PageLayout';
import { usePaginationFeature } from '../_framework/usePaginationFeature';

/**
 * ===========================================================================================
 * S5: CAROUSEL (Hook Approach)
 * ===========================================================================================
 *
 * Carousel-based data display.
 * Demonstrates carousel navigation with pagination.
 *
 * Features:
 * - pagination
 *
 * Architecture:
 * - Page creates pagination hook
 * - Widget renders carousel with navigation controls
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('rating', 'Rating'),
];

export function S5Page() {
	const pagination = usePaginationFeature({ defaultSize: 10 });

	return (
		<PageLayout>
			<HookCarousel service={productsService} columns={columns} features={[pagination]} />
		</PageLayout>
	);
}
