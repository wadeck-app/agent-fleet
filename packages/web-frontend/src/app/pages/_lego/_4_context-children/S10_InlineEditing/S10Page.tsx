import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { useDataTable } from '../_framework/DataTableContext';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S10: INLINE EDITING (Fork of S3)
 * ===========================================================================================
 *
 * Based on S3 (full featured table) but conceptually with inline editing instead of dialog-based edit.
 *
 * Note: Inline editing is not fully implemented in the compound component approach yet.
 * This scenario uses dialog editing but demonstrates the same feature composition as S3.
 * A full inline-edit implementation would require:
 * - Editable cell renderers
 * - Row-level edit state
 * - Save/cancel actions in row
 *
 * For now, this is identical to S3 to maintain parity across approaches.
 *
 * Features:
 * - search
 * - pagination
 * - sorting (multi-column)
 * - column-visibility
 * - bulk-delete
 * - crud (dialog-based)
 *
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

function S10Content() {
	const ctx = useDataTable<Product>();

	const handleSave = async (data: unknown) => {
		if (ctx.editingItem) {
			await ctx.service.updateProduct?.(ctx.editingItem.id, data);
		} else {
			await ctx.service.createProduct?.(data);
		}
		ctx.setDialogOpen(false);
		ctx.refresh();
	};

	return (
		<>
			<DataTable.Content>
				<DataTable.Toolbar>
					<DataTable.Search />
					<DataTable.ColumnVisibility />
					<DataTable.CreateButton dialog={ProductDialogAdapter} />
				</DataTable.Toolbar>
				<DataTable.BulkBar />
				<DataTable.Body />
				<DataTable.Footer>
					<DataTable.Pagination defaultSize={10} pageSizes={[10, 20, 50]} />
				</DataTable.Footer>
			</DataTable.Content>
			{ctx.dialogOpen && (
				<ProductDialogAdapter
					item={ctx.editingItem}
					onSave={handleSave}
					onClose={() => ctx.setDialogOpen(false)}
				/>
			)}
		</>
	);
}

export function S10Page() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={columns} enableSorting={true} enableCrud={true}>
				<S10Content />
			</DataTable>
		</PageLayout>
	);
}
