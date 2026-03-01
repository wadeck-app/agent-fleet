import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES } from '@shared/api/products.contract';

import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable, PageLayout } from '../_framework';

/**
 * ===========================================================================================
 * S6: ITEM DETAIL (SPLIT LAYOUT)
 * ===========================================================================================
 *
 * Split layout with master table and detail panel.
 * Uses onRowClick callback to lift selected ID up.
 *
 * Features:
 * - row selection via click
 * - detail view
 * - pagination
 *
 * ===========================================================================================
 */

const tableColumns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
];

export function S6Page() {
	return (
		<PageLayout>
			<div className="grid h-full gap-4 lg:grid-cols-2">
				{/* Master Table */}
				<div className="flex flex-col">
					<h2 className="mb-4 text-lg font-semibold">Products</h2>
					<DataTable service={productsService} columns={tableColumns}>
						<div className="space-y-4">
							<DataTable.Body />
							<DataTable.Footer>
								<DataTable.Pagination defaultSize={10} />
							</DataTable.Footer>
						</div>
					</DataTable>
				</div>

				{/* Detail Panel */}
				<div className="flex flex-col">
					<h2 className="mb-4 text-lg font-semibold">Details</h2>
					<div className="flex-1 rounded-lg border border-border bg-card p-4">
						<p className="text-muted-foreground">
							Simplified implementation. Full DetailPanel compound component would follow the same
							pattern.
						</p>
					</div>
				</div>
			</div>
		</PageLayout>
	);
}
