import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useLocalStorageState } from '@framework/hooks2/utility/useLocalStorageState';
import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Star } from 'lucide-react';

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
 * S_FORK_FEAT: FEATURE FORK (BOOKMARKS)
 * ===========================================================================================
 *
 * Fork of S3 (Full Featured) with an added bookmark feature.
 * Demonstrates how to add custom features without modifying the framework.
 *
 * Features:
 * - All S3 features: pagination, search, sorting
 * - Bookmark button () per row
 * - Bookmarked IDs stored in localStorage (key: lego-bookmarks-a3)
 * - Toolbar toggle: "All" | "Bookmarked only"
 * - Bookmarked count shown
 *
 * Architecture:
 * - Page-level bookmark state via useLocalStorageState
 * - Service wrapper to filter bookmarked items
 * - Custom column with bookmark button
 *
 * ===========================================================================================
 */

const STORAGE_KEY = 'lego-bookmarks-a3';

export function SForkFeatPage() {
	const [bookmarkedIds, setBookmarkedIds] = useLocalStorageState<string[]>(STORAGE_KEY, []);
	const [showBookmarked, setShowBookmarked] = useState(false);

	const search = useSearchFeature();
	const pagination = usePaginationFeature({ defaultSize: 10 });
	const sorting = useSortingFeature();
	const columnVisibility = useColumnVisibilityFeature();
	const bulkDelete = useBulkDeleteFeature();
	const crud = useCrudFeature(ProductDialogAdapter);

	const toggleBookmark = useCallback(
		(id: string) => {
			setBookmarkedIds(prev => (prev.includes(id) ? prev.filter(bid => bid !== id) : [...prev, id]));
		},
		[setBookmarkedIds]
	);

	const bookmarkedService = useMemo(
		() => ({
			getProducts: async (params?: any) => {
				const result = await productsService.getProducts(params);
				if (showBookmarked) {
					const filtered = result.items.filter(p => bookmarkedIds.includes(p.id));
					return {
						...result,
						items: filtered,
						total: filtered.length,
						pagination: result.pagination
							? {
									...result.pagination,
									total: filtered.length,
									totalPages: Math.ceil(filtered.length / result.pagination.pageSize),
								}
							: undefined,
					};
				}
				return result;
			},
			createProduct: productsService.createProduct.bind(productsService),
			updateProduct: productsService.updateProduct.bind(productsService),
			deleteProduct: productsService.deleteProduct.bind(productsService),
			bulkDeleteProducts: productsService.bulkDeleteProducts.bind(productsService),
		}),
		[showBookmarked, bookmarkedIds]
	);

	const columns = useMemo(
		() => [
			{
				key: '__bookmark__' as keyof Product,
				label: '',
				type: 'text' as const,
				render: (item: Product) => (
					<Button
						size="sm"
						variant="ghost"
						onClick={e => {
							e.stopPropagation();
							toggleBookmark(item.id);
						}}
					>
						<Star
							className={bookmarkedIds.includes(item.id) ? 'size-4 fill-primary text-primary' : 'size-4'}
						/>
					</Button>
				),
			},
			col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
			col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
			col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
			col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
			col.boolean<Product>('featured', 'Featured'),
			col.number<Product>('stock', 'Stock', { sortable: true }),
			col.number<Product>('rating', 'Rating', { sortable: true }),
			col.date<Product>('createdAt', 'Created'),
		],
		[bookmarkedIds, toggleBookmark]
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<Button variant={!showBookmarked ? 'default' : 'outline'} onClick={() => setShowBookmarked(false)}>
						All
					</Button>
					<Button variant={showBookmarked ? 'default' : 'outline'} onClick={() => setShowBookmarked(true)}>
						Bookmarked
					</Button>
				</div>
				<Badge variant="secondary"> {bookmarkedIds.length} bookmarked</Badge>
			</div>

			<PageLayout>
				<HookDataTable
					service={bookmarkedService}
					columns={columns}
					features={[search, pagination, sorting, columnVisibility, bulkDelete, crud]}
				/>
			</PageLayout>
		</div>
	);
}
