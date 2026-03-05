import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable } from '../_framework/HookDataTable';
import { HookDetailPanel } from '../_framework/HookDetailPanel';
import { PageLayout } from '../_framework/PageLayout';
import { SplitLayout } from '../_framework/SplitLayout';
import { usePaginationFeature } from '../_framework/usePaginationFeature';

/**
 * ===========================================================================================
 * S_BUS: EVENT BUS SELECTION WITH URL SYNC
 * ===========================================================================================
 *
 * Split layout with table on left and detail panel on right.
 * Demonstrates row selection with URL sync and keyboard navigation.
 *
 * Features:
 * - Click row to select item
 * - Selected item ID synced to URL (?id=xxx)
 * - Keyboard navigation (↑/↓ arrows) within current page
 * - Re-clicking selected row reloads the detail panel
 *
 * Architecture:
 * - Page-level state for selectedId
 * - URL sync via useSearchParams
 * - Keyboard navigation via onKeyDown on table container
 *
 * ===========================================================================================
 */

const tableColumns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
];

const detailColumns = [
	col.text<Product>('name', 'Name'),
	col.text<Product>('description', 'Description'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.number<Product>('stock', 'Stock'),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('rating', 'Rating', { suffix: ' / 5' }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function SBusPage() {
	const pagination = usePaginationFeature({ defaultSize: 10 });
	const [searchParams, setSearchParams] = useSearchParams();
	const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('id'));
	const [items, setItems] = useState<Product[]>([]);
	const containerRef = useRef<HTMLDivElement>(null);
	const [reloadCounter, setReloadCounter] = useState(0);

	const handleRowSelect = (id: string) => {
		if (id === selectedId) {
			setReloadCounter(prev => prev + 1);
		} else {
			setSelectedId(id);
			setSearchParams({ id });
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (items.length === 0 || !selectedId) {
			return;
		}

		const currentIndex = items.findIndex(item => item.id === selectedId);

		if (e.key === 'ArrowUp' && currentIndex > 0) {
			e.preventDefault();
			const newId = items[currentIndex - 1].id;
			setSelectedId(newId);
			setSearchParams({ id: newId });
		} else if (e.key === 'ArrowDown' && currentIndex >= 0 && currentIndex < items.length - 1) {
			e.preventDefault();
			const newId = items[currentIndex + 1].id;
			setSelectedId(newId);
			setSearchParams({ id: newId });
		}
	};

	return (
		<PageLayout>
			<div ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none', height: '100%' }}>
				<SplitLayout
					left={
						<HookDataTable
							service={productsService}
							columns={tableColumns}
							features={[pagination]}
							onRowSelect={handleRowSelect}
							onItemsLoaded={setItems}
						/>
					}
					right={
						<HookDetailPanel
							service={productsService}
							columns={detailColumns}
							selectedId={selectedId || undefined}
							key={`${selectedId}-${reloadCounter}`}
						/>
					}
					rightWidth="md"
				/>
			</div>
		</PageLayout>
	);
}
