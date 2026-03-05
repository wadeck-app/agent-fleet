import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { SearchInput } from '@framework/components/search/SearchInput';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

/**
 * ===========================================================================================
 * S_2TABLES: TWO INDEPENDENT TABLES (Data2-Based Approach)
 * ===========================================================================================
 *
 * Two completely independent Data2 instances on the same page.
 *
 * Table 1 (top): All products with pagination (10 per page) + search
 * Table 2 (bottom): "Recent Products" — products sorted by createdAt desc, pagination (5 per page)
 *
 * The tables are INDEPENDENT:
 * - Each has its own Data2 instance
 * - Each has its own pagination and search hooks
 * - Searching/paginating one does NOT affect the other
 * - Zero shared state
 *
 * Architecture:
 * - Two Data2 components with different fetchData callbacks
 * - Recent products sorted client-side by createdAt desc
 * - Each table has independent feature hooks
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
		key: 'createdAt',
		label: 'Created',
		render: item => new Date(item.createdAt).toLocaleDateString(),
	},
];

export function S2TablesPage() {
	const pagination1 = usePagination2({ pageSize: 10 });
	const search1 = useSimpleSearch({
		onSearchChange: () => {
			pagination1.actions.resetPage();
		},
	});

	const pagination2 = usePagination2({ pageSize: 5 });

	const fetchAllProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	const fetchRecentProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts({ ...query, page: 1, pageSize: 100 });
		const sortedItems = [...response.items].sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
		const page = query.page ?? 1;
		const pageSize = query.pageSize ?? 5;
		const startIndex = (page - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		const paginatedItems = sortedItems.slice(startIndex, endIndex);

		return {
			items: paginatedItems,
			pagination: {
				page,
				pageSize,
				total: sortedItems.length,
				totalPages: Math.ceil(sortedItems.length / pageSize),
			},
		};
	}, []);

	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
						<SearchInput
							value={search1.fstate.query}
							onChange={search1.actions.setQuery}
							onClear={search1.actions.clearQuery}
							placeholder="Search products..."
						/>

						<Data2 fetchData={fetchAllProducts} pagination={pagination1} search={search1}>
							{injectedProps => (
								<Table2 {...injectedProps} columns={columns} getItemId={item => item.id} />
							)}
						</Data2>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Products</CardTitle>
				</CardHeader>
				<CardContent>
					<Data2 fetchData={fetchRecentProducts} pagination={pagination2}>
						{injectedProps => <Table2 {...injectedProps} columns={columns} getItemId={item => item.id} />}
					</Data2>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
