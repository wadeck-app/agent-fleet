import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { SearchInput } from '@framework/components/search/SearchInput';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S3: FULL FEATURED TABLE
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Data2 + Table2 with all features enabled.
 * - usePagination2: Pagination with page size selector
 * - useSorting2: Multi-column sorting (shift+click)
 * - useSimpleSearch: Search input with debouncing
 * - useCacheControl2: Refresh control for cache busting
 *
 * Features:
 * - Pagination
 * - Sorting (multi-column)
 * - Search (debounced)
 * - Cache control (manual refresh)
 *
 * ===========================================================================================
 */

const columns: Table2Column<Product>[] = [
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
	{
		key: 'status',
		label: 'Status',
		render: item => {
			const statusLabel = PRODUCT_STATUSES.find(s => s === item.status);
			return statusLabel ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) : item.status;
		},
	},
	{
		key: 'stock',
		label: 'Stock',
		render: item => item.stock.toString(),
		sortable: true,
	},
	{
		key: 'rating',
		label: 'Rating',
		render: item => `${item.rating.toFixed(1)} / 5`,
		sortable: true,
	},
];

export function S3Page() {
	const pagination = usePagination2({ pageSize: 10 });
	const sorting = useSorting2({});
	const search = useSimpleSearch({
		onSearchChange: () => {
			pagination.actions.resetPage();
		},
	});
	const cache = useCacheControl2({ enabled: true });

	const fetchProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	return (
		<PageLayout>
			<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
					{injectedProps => <Table2 {...injectedProps} columns={columns} getItemId={item => item.id} />}
				</Data2>
			</div>
		</PageLayout>
	);
}
