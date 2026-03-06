import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { PageContainer } from '@framework/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { adaptCol } from '../_framework/adaptCol';

/**
 * ===========================================================================================
 * S9: TWO INDEPENDENT TABLES
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Two completely independent Data2 instances on the same page.
 * Table 1: All products
 * Table 2: Featured products only (client-side filter)
 *
 * Each table has:
 * - Its own Data2 instance
 * - Its own pagination hook
 * - Its own fetchData callback
 * - Zero shared state
 *
 * Demonstrates:
 * - Multiple independent data orchestrators
 * - No cross-table interference
 * - Composability without coordination
 *
 * ===========================================================================================
 */

const columns: Table2Column<Product>[] = [
	adaptCol(col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' })),
	adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
	adaptCol(col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true })),
	adaptCol(col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true })),
	adaptCol(col.boolean<Product>('featured', 'Featured')),
	adaptCol(col.number<Product>('stock', 'Stock', { sortable: true })),
	adaptCol(col.date<Product>('createdAt', 'Created')),
];

export function S9Page() {
	const pagination1 = usePagination2({ pageSize: 10 });
	const pagination2 = usePagination2({ pageSize: 10 });

	const fetchAllProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	const fetchFeaturedProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		const featuredItems = response.items.filter(p => p.featured);
		const pageSize = response.pagination?.pageSize ?? query.pageSize ?? 10;
		return {
			items: featuredItems,
			pagination: response.pagination
				? {
						total: featuredItems.length,
						page: response.pagination.page ?? 1,
						pageSize: response.pagination.pageSize ?? pageSize,
						totalPages: Math.max(1, Math.ceil(featuredItems.length / pageSize)),
					}
				: undefined,
		};
	}, []);

	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>All Products</CardTitle>
				</CardHeader>
				<CardContent>
					<Data2 fetchData={fetchAllProducts} pagination={pagination1}>
						{injectedProps => (
							<Table2 {...injectedProps} columns={columns} getItemId={item => item.id} simplePagination />
						)}
					</Data2>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Featured Products Only</CardTitle>
				</CardHeader>
				<CardContent>
					<Data2 fetchData={fetchFeaturedProducts} pagination={pagination2}>
						{injectedProps => (
							<Table2 {...injectedProps} columns={columns} getItemId={item => item.id} simplePagination />
						)}
					</Data2>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
