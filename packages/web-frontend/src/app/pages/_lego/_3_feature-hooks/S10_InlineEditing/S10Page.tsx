import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable } from '../_framework/HookDataTable';
import { PageLayout } from '../_framework/PageLayout';
import { useBulkDeleteFeature } from '../_framework/useBulkDeleteFeature';
import { useColumnVisibilityFeature } from '../_framework/useColumnVisibilityFeature';
import { useCrudFeature } from '../_framework/useCrudFeature';
import { usePaginationFeature } from '../_framework/usePaginationFeature';
import { useSearchFeature } from '../_framework/useSearchFeature';
import { useSortingFeature } from '../_framework/useSortingFeature';

/**
 * ===========================================================================================
 * S10: INLINE EDITING (Fork of S3)
 * ===========================================================================================
 *
 * Based on S3 (full featured table) but conceptually with inline editing instead of dialog-based edit.
 *
 * Note: Inline editing is not fully implemented in the hook approach yet.
 * This scenario uses dialog editing but demonstrates the same feature composition as S3.
 * A full inline-edit implementation would require:
 * - Custom cell renderers with editable state
 * - useInlineEditFeature hook
 * - Row-level save/cancel actions
 *
 * For now, this is identical to S3 to maintain parity across approaches.
 *
 * Features:
 * - search
 * - pagination
 * - sorting (multi-column)
 * - column-visibility
 * - bulk-delete
 * - crud (dialog-based)
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
