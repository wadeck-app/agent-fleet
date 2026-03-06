import { useCallback, useState } from 'react';

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
 * S6: ITEM DETAIL PANEL
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Split-panel layout with master-detail.
 * Left: Data2 + Table2 (master list)
 * Right: Data2DetailPanel (detail view)
 *
 * Selection is managed at page level via useState.
 * - Table2 onRowClick sets selectedId
 * - Data2DetailPanel fetches item by selectedId
 *
 * Features:
 * - Pagination (left panel)
 * - Row click selection
 * - Split layout (responsive)
 * - Independent data fetching (detail panel fetches separately)
 *
 * ===========================================================================================
 */

const tableColumns: Table2Column<Product>[] = [
	adaptCol(col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' })),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
];

// Detail panel columns - use adaptCol for render logic but ensure label is string
// Data2DetailPanel expects { key, label: string, render }, not full Table2Column
const detailColumns = [
	adaptCol(col.text<Product>('name', 'Name')),
	adaptCol(col.text<Product>('description', 'Description')),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$' })),
	adaptCol(col.number<Product>('stock', 'Stock')),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
	adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
	adaptCol(col.number<Product>('rating', 'Rating')),
	adaptCol(col.boolean<Product>('featured', 'Featured')),
	adaptCol(col.date<Product>('createdAt', 'Created')),
].map(col => ({
	key: col.key,
	label: typeof col.label === 'string' ? col.label : String(col.key),
	render: col.render,
}));

export function S6Page() {
	const pagination = usePagination2({ pageSize: 10 });
	const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

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

	return (
		<PageLayout>
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
				right={<Data2DetailPanel service={productsService} columns={detailColumns} selectedId={selectedId} />}
				rightWidth="md"
			/>
		</PageLayout>
	);
}
