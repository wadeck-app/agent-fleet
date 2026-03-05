import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S2: TABLE WITH PAGINATION
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Data2 + Table2 with pagination feature.
 * - usePagination2 hook provides pagination state + actions
 * - Data2 composes pagination into backend query
 * - Table2 displays pagination controls
 *
 * Features:
 * - Pagination (10 items per page)
 *
 * ===========================================================================================
 */

const columns: Table2Column<Product>[] = [
	{
		key: 'name',
		label: 'Name',
		render: item => item.name,
	},
	{
		key: 'price',
		label: 'Price',
		render: item => `$${item.price.toFixed(2)}`,
	},
	{
		key: 'category',
		label: 'Category',
		render: item => {
			const categoryLabel = PRODUCT_CATEGORIES.find(cat => cat === item.category);
			return categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : item.category;
		},
	},
	{
		key: 'stock',
		label: 'Stock',
		render: item => item.stock.toString(),
	},
];

export function S2Page() {
	const pagination = usePagination2({ pageSize: 10 });

	const fetchProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	return (
		<PageLayout>
			<Data2 fetchData={fetchProducts} pagination={pagination}>
				{injectedProps => <Table2 {...injectedProps} columns={columns} getItemId={item => item.id} />}
			</Data2>
		</PageLayout>
	);
}
