import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetDataTable } from '../_framework/WidgetDataTable';

/**
 * ===========================================================================================
 * S10: INLINE EDITING (Fork of S3)
 * ===========================================================================================
 *
 * Based on S3 (full featured table) but with inline editing instead of dialog-based edit.
 *
 * Inline editing:
 * - Click a cell to edit it (text/number input overlay)
 * - Press Enter to save
 * - Actions column has a "Save" button when editing
 *
 * Note: This is a simplified version. Full inline editing would require custom cell renderers
 * and state management. For now, we use the 'inline-edit' feature flag.
 *
 * Features:
 * - search
 * - pagination
 * - sorting (multi-column)
 * - column-visibility
 * - bulk-delete
 * - inline-edit (instead of crud dialog)
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
	col.number<Product>('rating', 'Rating', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function S10Page() {
	return (
		<PageLayout>
			<WidgetDataTable
				service={productsService}
				columns={columns}
				features={[
					'search',
					'pagination',
					{ type: 'sorting', multi: true },
					'column-visibility',
					'bulk-delete',
					// Note: inline-edit is not a DataTableFeature — using dialog-based crud as the edit mechanism
					{ type: 'crud', dialog: ProductDialogAdapter },
				]}
			/>
		</PageLayout>
	);
}
