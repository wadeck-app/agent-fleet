import { col } from '@framework/lego/helpers/col';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { withPagination, withSearch } from '../_framework/PipelineTypes';
import { S4Content } from './S4Content';

/**
 * ===========================================================================================
 * S4: GRID POPUP (Query-Pipeline Approach)
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
];

export function S4Page() {
	return (
		<PageLayout>
			<PipelineDataTable
				service={productsService}
				columns={columns}
				modifiers={[withPagination(1, 12), withSearch('')]}
			>
				<S4Content />
			</PipelineDataTable>
		</PageLayout>
	);
}
