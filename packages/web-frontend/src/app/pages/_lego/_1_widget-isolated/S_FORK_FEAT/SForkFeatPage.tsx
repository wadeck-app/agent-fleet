/**
 * ===========================================================================================
 * S_FORK_FEAT: FEATURE FORK (BOOKMARKS)
 * ===========================================================================================
 *
 * Fork of S3 (Full Featured) with added bookmark feature.
 * Demonstrates extending existing scenarios without modifying framework.
 *
 * Features:
 * - All S3 features: search, pagination, sorting, column visibility, bulk delete, CRUD
 * - Bookmark feature: star/bookmark button per row
 * - Bookmarked IDs stored in localStorage
 * - Toolbar toggle: "All" | "Bookmarked" (shows only bookmarked items when active)
 * - Bookmarked count shown in toolbar: " 3 bookmarked"
 * - No changes to existing framework -- all in page
 *
 * ===========================================================================================
 */
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { col } from '@framework/lego/helpers/col';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Star } from 'lucide-react';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetDataTable } from '../_framework/WidgetDataTable';

const BOOKMARKS_KEY = 'lego-bookmarks-a1';

const baseColumns: ColumnDef<Product>[] = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.number<Product>('rating', 'Rating', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function SForkFeatPage() {
	const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
		const stored = localStorage.getItem(BOOKMARKS_KEY);
		if (stored) {
			try {
				return new Set(JSON.parse(stored) as string[]);
			} catch {
				return new Set();
			}
		}
		return new Set();
	});

	const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);

	useEffect(() => {
		localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(bookmarkedIds)));
	}, [bookmarkedIds]);

	const toggleBookmark = useCallback((id: string) => {
		setBookmarkedIds(prev => {
			const newSet = new Set(prev);
			if (newSet.has(id)) {
				newSet.delete(id);
			} else {
				newSet.add(id);
			}
			return newSet;
		});
	}, []);

	const columns: ColumnDef<Product>[] = [
		{
			key: '__bookmark__' as keyof Product & string,
			label: '',
			type: 'custom',
			render: (item: Product) => (
				<Button
					variant="ghost"
					size="sm"
					onClick={e => {
						e.stopPropagation();
						toggleBookmark(item.id);
					}}
				>
					<Star className={bookmarkedIds.has(item.id) ? 'size-4 fill-primary text-primary' : 'size-4'} />
				</Button>
			),
		},
		...baseColumns,
	];

	const filteredService = {
		getProducts: async (params?: {
			search?: string;
			page?: number;
			pageSize?: number;
			sortBy?: string;
			sortOrder?: string;
		}) => {
			const result = await productsService.getProducts(params);
			if (showOnlyBookmarked) {
				return {
					...result,
					items: result.items.filter(p => bookmarkedIds.has(p.id)),
					total: result.items.filter(p => bookmarkedIds.has(p.id)).length,
					pagination: result.pagination
						? {
								...result.pagination,
								total: result.items.filter(p => bookmarkedIds.has(p.id)).length,
								totalPages: Math.ceil(
									result.items.filter(p => bookmarkedIds.has(p.id)).length /
										result.pagination.pageSize
								),
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
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<Button
						variant={!showOnlyBookmarked ? 'default' : 'outline'}
						onClick={() => setShowOnlyBookmarked(false)}
					>
						All
					</Button>
					<Button
						variant={showOnlyBookmarked ? 'default' : 'outline'}
						onClick={() => setShowOnlyBookmarked(true)}
					>
						Bookmarked
					</Button>
				</div>
				<Badge variant="secondary"> {bookmarkedIds.size} bookmarked</Badge>
			</div>

			<PageLayout>
				<WidgetDataTable
					service={filteredService}
					columns={columns}
					features={[
						'search',
						'pagination',
						{ type: 'sorting', multi: true },
						'column-visibility',
						'bulk-delete',
						{ type: 'crud', dialog: ProductDialogAdapter },
					]}
				/>
			</PageLayout>
		</div>
	);
}
