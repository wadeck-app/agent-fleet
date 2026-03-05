import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineDetailPanel } from '../_framework/PipelineDetailPanel';
import { withPagination } from '../_framework/PipelineTypes';
import { SplitLayout } from '../_framework/SplitLayout';

/**
 * ===========================================================================================
 * S_BUS: EVENTBUS SELECTION WITH URL SYNC (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Split layout with table on left and detail panel on right.
 * Selection synced to URL via useSearchParams.
 *
 * Features:
 * - Click row → select item → detail panel shows item details
 * - Selected item ID synced to URL: ?id=xxx
 * - Keyboard ↑/↓ arrows: navigate selection
 * - Re-clicking already selected row refreshes detail panel
 *
 * Architecture:
 * - PipelineDataTable provides context for left panel
 * - PipelineBody handles row click and sets selectedId
 * - selectedId synced to URL via useSearchParams
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
	const [searchParams, setSearchParams] = useSearchParams();
	const urlId = searchParams.get('id');
	const [selectedId, setSelectedId] = useState<string | undefined>(urlId ?? undefined);
	const [items, setItems] = useState<Product[]>([]);

	useEffect(() => {
		void productsService.getProducts({ page: 1, pageSize: 100 }).then(response => {
			setItems(response.items);
		});
	}, []);

	useEffect(() => {
		if (selectedId) {
			setSearchParams({ id: selectedId });
		} else {
			setSearchParams({});
		}
	}, [selectedId, setSearchParams]);

	const handleRowClick = (item: Product) => {
		setSelectedId(item.id);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (!selectedId || items.length === 0) {
			return;
		}

		const currentIndex = items.findIndex(item => item.id === selectedId);
		if (currentIndex === -1) {
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
			setSelectedId(items[prevIndex].id);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
			setSelectedId(items[nextIndex].id);
		}
	};

	return (
		<div tabIndex={0} onKeyDown={handleKeyDown}>
			<SplitLayout
				left={
					<PipelineDataTable
						service={productsService}
						columns={tableColumns}
						modifiers={[withPagination(1, 10)]}
					>
						<PipelineContent>
							<PipelineBody showPagination onRowClick={handleRowClick} showCursor />
						</PipelineContent>
					</PipelineDataTable>
				}
				right={
					<PipelineDetailPanel service={productsService} columns={detailColumns} selectedId={selectedId} />
				}
				rightWidth="md"
			/>
		</div>
	);
}
