import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { withPagination, withSearch } from '../_framework/PipelineTypes';
import { S10Content } from './S10Content';

/**
 * ===========================================================================================
 * S10: INLINE EDITING (Query-Pipeline Approach)
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name', { sortable: true, sticky: 'left' }),
	col.number<Product>('price', 'Price', { prefix: '$', sortable: true }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
	col.boolean<Product>('featured', 'Featured'),
	col.number<Product>('stock', 'Stock', { sortable: true }),
	col.number<Product>('rating', 'Rating', { sortable: true }),
	col.date<Product>('createdAt', 'Created'),
];

export function S10Page() {
	return (
		<PageLayout>
			<PipelineDataTable
				service={productsService}
				columns={columns}
				modifiers={[withSearch(''), withPagination(1, 10)]}
			>
				<S10Content />
			</PipelineDataTable>
		</PageLayout>
	);
}
