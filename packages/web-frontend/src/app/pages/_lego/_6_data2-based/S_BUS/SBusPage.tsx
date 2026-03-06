import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { Data2DetailPanel } from '../_framework/Data2DetailPanel';
import { PageLayout } from '../_framework/PageLayout';
import { SplitLayout } from '../_framework/SplitLayout';
import { adaptCol } from '../_framework/adaptCol';

/**
 * ===========================================================================================
 * S_BUS: EVENTBUS SELECTION WITH URL SYNC (Data2-Based Approach)
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
 * - Data2 + Table2 for left panel with pagination
 * - Data2DetailPanel for right panel
 * - selectedId synced to URL via useSearchParams
 * - Keyboard navigation via onKeyDown on wrapper div
 *
 * ===========================================================================================
 */

const tableColumns: Table2Column<Product>[] = [
	adaptCol(col.text<Product>('name', 'Name', { sortable: true })),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
];

const detailColumns = [
	adaptCol(col.text<Product>('name', 'Name')),
	adaptCol(col.text<Product>('description', 'Description')),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$' })),
	adaptCol(col.number<Product>('stock', 'Stock')),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
	adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
	adaptCol(col.number<Product>('rating', 'Rating', { suffix: ' / 5' })),
	adaptCol(col.boolean<Product>('featured', 'Featured')),
	adaptCol(col.date<Product>('createdAt', 'Created')),
];

export function SBusPage() {
	const pagination = usePagination2({ pageSize: 10 });
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

	const fetchProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

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
		<PageLayout>
			<div tabIndex={0} onKeyDown={handleKeyDown}>
				<SplitLayout
					left={
						<Data2 fetchData={fetchProducts} pagination={pagination}>
							{injectedProps => (
								<Table2
									{...injectedProps}
									columns={tableColumns}
									getItemId={item => item.id}
									onRowClick={handleRowClick}
									simplePagination
								/>
							)}
						</Data2>
					}
					right={
						<Data2DetailPanel service={productsService} columns={detailColumns} selectedId={selectedId} />
					}
					rightWidth="md"
				/>
			</div>
		</PageLayout>
	);
}
