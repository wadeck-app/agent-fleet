import type { Product } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';

import { DataTable } from '../_framework/DataTable';
import { useDataTable } from '../_framework/DataTableContext';

export function S4Content() {
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
