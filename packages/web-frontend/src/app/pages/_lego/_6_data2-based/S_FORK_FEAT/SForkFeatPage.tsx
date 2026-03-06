import { useCallback, useEffect, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import { col } from '@framework/lego';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Star } from 'lucide-react';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { adaptCol } from '../_framework/adaptCol';

/**
 * ===========================================================================================
 * S_FORK_FEAT: FEATURE FORK - BOOKMARKS (Data2-Based Approach)
 * ===========================================================================================
 *
 * Fork of S3 (Full Featured) with added bookmark functionality.
 * Demonstrates adding a new feature without changing framework code.
 *
 * Features:
 * - Search (debounced)
 * - Pagination (10 items per page)
 * - Sorting (multi-column)
 * - Bookmark button (⭐) per row
 * - Bookmarked IDs stored in localStorage (key: lego-bookmarks-a6)
 * - Toolbar toggle: "All" | "Bookmarked only"
 * - Bookmark count: "⭐ X bookmarked"
 *
 * Architecture:
 * - Data2 + Table2 with feature hooks
 * - Bookmark state managed in page-level useState + localStorage
 * - Custom bookmark column via Table2's renderActions prop
 * - Filter applied in fetchData callback based on showBookmarked flag
 *
 * ===========================================================================================
 */

const BOOKMARK_STORAGE_KEY = 'lego-bookmarks-a6';

function loadBookmarks(): Set<string> {
	const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
	if (!stored) {
		return new Set();
	}
	try {
		return new Set(JSON.parse(stored) as string[]);
	} catch {
		return new Set();
	}
}

function saveBookmarks(bookmarks: Set<string>) {
	localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(Array.from(bookmarks)));
}

export function SForkFeatPage() {
	const pagination = usePagination2({ pageSize: 10 });
	const sorting = useSorting2({});
	const search = useSimpleSearch({
		onSearchChange: () => {
			pagination.actions.resetPage();
		},
	});
	const cache = useCacheControl2({ enabled: true });

	const [bookmarks, setBookmarks] = useState<Set<string>>(loadBookmarks);
	const [showBookmarked, setShowBookmarked] = useState(false);

	useEffect(() => {
		saveBookmarks(bookmarks);
	}, [bookmarks]);

	const toggleBookmark = (id: string) => {
		setBookmarks(prev => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const fetchProducts = useCallback(
		async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
			const response = await productsService.getProducts(query);

			if (!showBookmarked) {
				return {
					items: response.items,
					pagination: response.pagination,
				};
			}

			const filteredItems = response.items.filter(item => bookmarks.has(item.id));
			return {
				items: filteredItems,
				pagination: response.pagination
					? {
							...response.pagination,
							total: filteredItems.length,
							totalPages: Math.ceil(filteredItems.length / (response.pagination.pageSize || 10)),
						}
					: undefined,
			};
		},
		[showBookmarked, bookmarks]
	);

	const columns: Table2Column<Product>[] = [
		{
			key: 'bookmark',
			label: '',
			render: item => (
				<Button
					size="sm"
					variant="ghost"
					onClick={e => {
						e.stopPropagation();
						toggleBookmark(item.id);
					}}
				>
					<Star className={bookmarks.has(item.id) ? 'size-4 fill-primary text-primary' : 'size-4'} />
				</Button>
			),
		},
		adaptCol(col.text<Product>('name', 'Name', { sortable: true })),
		adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
		adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
		adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
		adaptCol(col.number<Product>('stock', 'Stock', { sortable: true })),
		adaptCol(col.number<Product>('rating', 'Rating', { sortable: true })),
		adaptCol(col.boolean<Product>('featured', 'Featured')),
		adaptCol(col.date<Product>('createdAt', 'Created')),
	];

	const bookmarkCount = Array.from(bookmarks).length;

	return (
		<PageLayout>
			<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
				<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
					<Button variant={!showBookmarked ? 'default' : 'outline'} onClick={() => setShowBookmarked(false)}>
						All
					</Button>
					<Button variant={showBookmarked ? 'default' : 'outline'} onClick={() => setShowBookmarked(true)}>
						Bookmarked only
					</Button>
					<span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
						<Star className="inline-block size-4" /> {bookmarkCount} bookmarked
					</span>
				</div>

				<SearchInput
					value={search.fstate.query}
					onChange={search.actions.setQuery}
					onClear={search.actions.clearQuery}
					placeholder="Search products..."
				/>

				<Data2
					fetchData={fetchProducts}
					pagination={pagination}
					sorting={sorting}
					search={search}
					cache={cache}
				>
					{injectedProps => (
						<Table2 {...injectedProps} columns={columns} getItemId={item => item.id} simplePagination />
					)}
				</Data2>
			</div>
		</PageLayout>
	);
}
