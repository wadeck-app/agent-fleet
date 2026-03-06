import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { type Table2Column } from '@framework/components2/table/Table2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { Data2Carousel } from '../_framework/Data2Carousel';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S5: CAROUSEL
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Carousel display with pagination navigation.
 * - Data2Carousel: Horizontal scrollable cards
 * - usePagination2: Prev/next navigation
 * - Field visibility toggle (local state in carousel component)
 *
 * Features:
 * - Pagination (5 items per page)
 * - Carousel layout (horizontal scroll)
 * - Field toggle (show more/less)
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
		key: 'status',
		label: 'Status',
		render: item => {
			const statusLabel = PRODUCT_STATUSES.find(s => s === item.status);
			return statusLabel ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) : item.status;
		},
	},
	{
		key: 'featured',
		label: 'Featured',
		render: item => (item.featured ? 'Yes' : 'No'),
	},
	{
		key: 'rating',
		label: 'Rating',
		render: item => `${item.rating.toFixed(1)} / 5`,
	},
];

export function S5Page() {
	const pagination = usePagination2({ pageSize: 5 });

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
				{injectedProps => <Data2Carousel {...injectedProps} columns={columns} getItemId={item => item.id} />}
			</Data2>
		</PageLayout>
	);
}
