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
 * S4: GRID POPUP
 * ===========================================================================================
 *
 * Items displayed as a CSS grid of cards with search, pagination, and CRUD via dialog.
 * Uses DataTable.Grid (card grid) + DataTable.GridFooter instead of DataTable.Body (table).
 *
 * Features:
 * - search
 * - pagination
 * - crud (via popup dialog)
 *
 * ===========================================================================================
 */

const columns = [
	col.text<Product>('name', 'Name'),
	col.number<Product>('price', 'Price', { prefix: '$' }),
	col.enum<Product>('category', 'Category', PRODUCT_CATEGORIES, { badge: true }),
	col.enum<Product>('status', 'Status', PRODUCT_STATUSES, { badge: true }),
];

function S4Content() {
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
					<DataTable.CreateButton dialog={ProductDialogAdapter} />
				</DataTable.Toolbar>
				<DataTable.Grid />
				<DataTable.GridFooter />
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

export function S4Page() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={columns} enableCrud={true}>
				<S4Content />
			</DataTable>
		</PageLayout>
	);
}
