import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetCarousel } from '../_framework/WidgetCarousel';

/**
 * ===========================================================================================
 * S5: CAROUSEL
 * ===========================================================================================
 *
 * Horizontal carousel with field visibility toggle and pagination.
 * Demonstrates the WidgetCarousel component.
 *
 * Features:
 * - field-visibility (toggle which fields to show)
 * - pagination (prev/next navigation)
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
	return (
		<PageLayout>
			<WidgetCarousel
				service={productsService}
				columns={columns}
				features={[{ type: 'field-visibility' }, 'pagination']}
			/>
		</PageLayout>
	);
}
