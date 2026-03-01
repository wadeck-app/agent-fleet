import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import {
	HookDataTable,
	PageLayout,
	useBulkDeleteFeature,
	useColumnVisibilityFeature,
	useCrudFeature,
	usePaginationFeature,
	useSearchFeature,
	useSortingFeature,
} from '../_framework';

/**
 * ===========================================================================================
 * S3: FULL-FEATURED TABLE (Hook Approach)
 * ===========================================================================================
 *
 * Complete data table with all features enabled.
 * Demonstrates the full power of the hook-based approach.
 *
 * Features:
 * - search
 * - pagination
 * - sorting
 * - column-visibility
 * - bulk-delete
 * - crud
 *
 * Architecture:
 * - Page creates all feature hooks (typed instances)
 * - Widget receives hooks as array and extracts by type
 * - State lives in page hooks, widget is controlled
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

export function S3Page() {
	const search = useSearchFeature();
	const pagination = usePaginationFeature({ defaultSize: 10 });
	const sorting = useSortingFeature();
	const columnVisibility = useColumnVisibilityFeature();
	const bulkDelete = useBulkDeleteFeature();
	const crud = useCrudFeature(ProductDialogAdapter);

	return (
		<PageLayout>
			<HookDataTable
				service={productsService}
				columns={columns}
				features={[search, pagination, sorting, columnVisibility, bulkDelete, crud]}
			/>
		</PageLayout>
	);
}
