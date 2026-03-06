import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { col } from '@framework/lego';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { adaptCol } from '../_framework/adaptCol';

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
	adaptCol(col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' })),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
	adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
	adaptCol(col.boolean<Product>('featured', 'Featured')),
	adaptCol(col.date<Product>('createdAt', 'Created')),
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
				{injectedProps => (
					<Table2 {...injectedProps} columns={columns} getItemId={item => item.id} simplePagination />
				)}
			</Data2>
		</PageLayout>
	);
}
