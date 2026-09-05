import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { col } from '@framework/lego/helpers/col';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Star } from 'lucide-react';

import { PageLayout } from '../_framework/PageLayout';
import { ProductDialogAdapter } from '../_framework/ProductDialogAdapter';
import { ViewDataTable } from '../_framework/ViewDataTable';

const BOOKMARKS_KEY = 'lego-bookmarks-a2';

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

export function SForkFeatPageContent() {
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

	const columns: ColumnDef<Product>[] = useMemo(
		() => [
			{
				key: '__bookmark__' as keyof Product & string,
				label: '⭐',
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
		],
		[bookmarkedIds, toggleBookmark]
	);

	const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(false);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<Button variant={!showOnlyBookmarked ? 'default' : 'outline'} onClick={() => setShowOnlyBookmarked(false)}>All</Button>
					<Button variant={showOnlyBookmarked ? 'default' : 'outline'} onClick={() => setShowOnlyBookmarked(true)}>Bookmarked</Button>
				</div>
				<Badge variant="secondary">⭐ {bookmarkedIds.size} bookmarked</Badge>
			</div>

			<PageLayout>
				<ViewDataTable
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
