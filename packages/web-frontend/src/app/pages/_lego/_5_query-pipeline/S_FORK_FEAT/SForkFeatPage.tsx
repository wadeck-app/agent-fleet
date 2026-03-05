import { useEffect, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { col } from '@framework/lego';
import type { ColumnDef } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Star } from 'lucide-react';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { usePipelineContext } from '../_framework/PipelineContext';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';
import { withPagination, withSearch } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S_FORK_FEAT: FEATURE FORK - BOOKMARKS (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Fork of S3 (Full Featured) with added bookmark functionality.
 * Demonstrates adding a new feature without changing framework code.
 *
 * Features:
 * - Search (via PipelineSearch)
 * - Pagination (10 items per page)
 * - Sorting (via column headers)
 * - Bookmark button (⭐) per row
 * - Bookmarked IDs stored in localStorage (key: lego-bookmarks-a5)
 * - Toolbar toggle: "All" | "Bookmarked only"
 * - Bookmark count: "⭐ X bookmarked"
 *
 * Architecture:
 * - PipelineDataTable provides base context with search/pagination
 * - Bookmark state managed in page-level useState + localStorage
 * - Custom bookmark column added via col.custom
 * - Filter applied via wrapper service that filters by bookmarks
 *
 * ===========================================================================================
 */

const BOOKMARK_STORAGE_KEY = 'lego-bookmarks-a5';

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

function SForkFeatContent({ bookmarks }: { bookmarks: Set<string> }) {
	const { items } = usePipelineContext<Product>();

	const bookmarkCount = Array.from(items).filter(item => bookmarks.has(item.id)).length;

	return (
		<PipelineContent>
			<PipelineToolbar>
				<PipelineSearch />
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">
						<Star className="inline-block size-4" /> {bookmarkCount} bookmarked
					</span>
				</div>
			</PipelineToolbar>
			<PipelineBody showPagination />
		</PipelineContent>
	);
}

export function SForkFeatPage() {
	const [showBookmarked, setShowBookmarked] = useState(false);
	const [bookmarks, setBookmarks] = useState<Set<string>>(loadBookmarks);

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

	const bookmarkColumn: ColumnDef<Product> = {
		key: 'id' as keyof Product,
		label: '',
		sortable: false,
		render: (item: Product) => (
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
	};

	const columns = [bookmarkColumn, ...baseColumns];

	const serviceWrapper = {
		getProducts: async (params?: any) => {
			const result = await productsService.getProducts(params);
			if (!showBookmarked) {
				return result;
			}
			const filteredItems = result.items.filter(item => bookmarks.has(item.id));
			return {
				items: filteredItems,
				pagination: result.pagination
					? {
							...result.pagination,
							total: filteredItems.length,
							totalPages: Math.ceil(filteredItems.length / (result.pagination.pageSize || 10)),
						}
					: undefined,
			};
		},
	};

	return (
		<PageLayout>
			<div className="mb-4 flex gap-2">
				<Button variant={!showBookmarked ? 'default' : 'outline'} onClick={() => setShowBookmarked(false)}>
					All
				</Button>
				<Button variant={showBookmarked ? 'default' : 'outline'} onClick={() => setShowBookmarked(true)}>
					Bookmarked only
				</Button>
			</div>
			<PipelineDataTable
				service={serviceWrapper}
				columns={columns}
				modifiers={[withSearch(''), withPagination(1, 10)]}
			>
				<SForkFeatContent bookmarks={bookmarks} />
			</PipelineDataTable>
		</PageLayout>
	);
}
