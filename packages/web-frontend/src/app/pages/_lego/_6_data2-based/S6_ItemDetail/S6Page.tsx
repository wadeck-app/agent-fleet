import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { Data2DetailPanel } from '../_framework/Data2DetailPanel';
import { PageLayout } from '../_framework/PageLayout';
import { SplitLayout } from '../_framework/SplitLayout';

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
	{
		key: 'name',
		label: 'Name',
		render: item => item.name,
		sortable: true,
	},
	{
		key: 'price',
		label: 'Price',
		render: item => `$${item.price.toFixed(2)}`,
		sortable: true,
	},
	{
		key: 'category',
		label: 'Category',
		render: item => {
			const categoryLabel = PRODUCT_CATEGORIES.find(cat => cat === item.category);
			return categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : item.category;
		},
	},
];

const detailColumns = [
	{
		key: 'name',
		label: 'Name',
		render: (item: Product) => item.name,
	},
	{
		key: 'description',
		label: 'Description',
		render: (item: Product) => item.description,
	},
	{
		key: 'price',
		label: 'Price',
		render: (item: Product) => `$${item.price.toFixed(2)}`,
	},
	{
		key: 'stock',
		label: 'Stock',
		render: (item: Product) => item.stock.toString(),
	},
	{
		key: 'category',
		label: 'Category',
		render: (item: Product) => {
			const categoryLabel = PRODUCT_CATEGORIES.find(cat => cat === item.category);
			return categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : item.category;
		},
	},
	{
		key: 'status',
		label: 'Status',
		render: (item: Product) => {
			const statusLabel = PRODUCT_STATUSES.find(s => s === item.status);
			return statusLabel ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) : item.status;
		},
	},
	{
		key: 'rating',
		label: 'Rating',
		render: (item: Product) => `${item.rating.toFixed(1)} / 5`,
	},
	{
		key: 'featured',
		label: 'Featured',
		render: (item: Product) => (item.featured ? 'Yes' : 'No'),
	},
	{
		key: 'createdAt',
		label: 'Created',
		render: (item: Product) => new Date(item.createdAt).toLocaleDateString(),
	},
];

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
