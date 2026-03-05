import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import type { FetchDataResult } from '@framework/hooks2/data/useDataFetch';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S1: SIMPLE TABLE
 * ===========================================================================================
 *
 * Architecture: A6 Data2-Based
 *
 * Minimal Data2 + Table2 setup with no features.
 * - No pagination
 * - No search
 * - No sorting
 * - Just basic table display
 *
 * Components:
 * - Data2: Headless data orchestrator
 * - Table2: Pure table presentation
 * - useCallback for stable fetchData reference
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
];

export function S1Page() {
	const fetchProducts = useCallback(async (query: ComposedQuery): Promise<FetchDataResult<Product>> => {
		const response = await productsService.getProducts(query);
		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	return (
		<PageLayout>
			<Data2 fetchData={fetchProducts}>
				{injectedProps => <Table2 {...injectedProps} columns={columns} getItemId={item => item.id} />}
			</Data2>
		</PageLayout>
	);
}
