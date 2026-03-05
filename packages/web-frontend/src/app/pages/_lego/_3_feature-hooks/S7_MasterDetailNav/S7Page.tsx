import { useState } from 'react';

import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable } from '../_framework/HookDataTable';
import { HookDetailPanelNav } from '../_framework/HookDetailPanelNav';
import { PageLayout } from '../_framework/PageLayout';
import { SplitLayout } from '../_framework/SplitLayout';
import { usePaginationFeature } from '../_framework/usePaginationFeature';
import { useSelectionFeature } from '../_framework/useSelectionFeature';

/**
 * ===========================================================================================
 * S7: MASTER-DETAIL NAVIGATOR
 * ===========================================================================================
 *
 * Master-detail layout with URL-synced selection and prev/next navigation.
 * Demonstrates hook-based feature composition with selection management.
 *
 * Features:
 * - Click row to select
 * - URL sync (?id=xxx)
 * - Prev/next navigation within current page
 * - Hook-based state management
 *
 * ===========================================================================================
 */

const tableColumns = [
	col.text<Product>('name', 'Name', { sortable: true }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
];

const detailColumns = [
	col.text<Product>('name', 'Name'),
	col.text<Product>('description', 'Description'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.number<Product>('stock', 'Stock'),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.number<Product>('rating', 'Rating', { suffix: ' / 5' }),
	col.boolean<Product>('featured', 'Featured'),
	col.date<Product>('createdAt', 'Created'),
];

export function S7Page() {
	const pagination = usePaginationFeature({ defaultSize: 10 });
	const selection = useSelectionFeature();
	const [items, setItems] = useState<Product[]>([]);

	return (
		<PageLayout>
			<SplitLayout
				left={
					<HookDataTable
						service={productsService}
						columns={tableColumns}
						features={[pagination]}
						onRowSelect={id => selection.selectItem(id)}
						onItemsLoaded={setItems}
					/>
				}
				right={
					<HookDetailPanelNav
						service={productsService}
						columns={detailColumns}
						selectedId={selection.selectedId}
						items={items}
						onNavigate={id => selection.selectItem(id)}
					/>
				}
				rightWidth="md"
			/>
		</PageLayout>
	);
}
