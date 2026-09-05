import { useState } from 'react';

import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { Product } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { useDataTable } from '../_framework/DataTableContext';

type EditMode = 'dialog' | 'inline' | 'below';

export function SEditContent() {
	const [editMode, setEditMode] = useState<EditMode>('dialog');
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

	const handleSaveBelow = async (data: any) => {
		if (ctx.selectedItem) {
			await productsService.updateProduct(ctx.selectedItem.id, {
				...data,
				version: ctx.selectedItem.version,
			});
			ctx.setSelectedItemId(undefined);
			ctx.refresh();
		}
	};

	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>Edit Mode Selector</CardTitle>
				</CardHeader>
				<CardContent>
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						<Button variant={editMode === 'dialog' ? 'default' : 'outline'} onClick={() => setEditMode('dialog')}>Dialog</Button>
						<Button variant={editMode === 'inline' ? 'default' : 'outline'} onClick={() => setEditMode('inline')}>Inline Actions</Button>
						<Button variant={editMode === 'below' ? 'default' : 'outline'} onClick={() => setEditMode('below')}>Form Below</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<DataTable.Content>
						<DataTable.Toolbar>
							<DataTable.Search />
							<DataTable.ColumnVisibility />
							{(editMode === 'dialog' || editMode === 'inline') && (
								<DataTable.CreateButton dialog={ProductDialogAdapter} />
							)}
						</DataTable.Toolbar>
						<DataTable.BulkBar />
						<DataTable.Body />
						<DataTable.Footer>
							<DataTable.Pagination defaultSize={10} pageSizes={[10, 20, 50]} />
						</DataTable.Footer>
					</DataTable.Content>
					{(editMode === 'dialog' || editMode === 'inline') && ctx.dialogOpen && (
						<ProductDialogAdapter
							item={ctx.editingItem}
							onSave={handleSave}
							onClose={() => ctx.setDialogOpen(false)}
						/>
					)}
				</CardContent>
			</Card>

			{editMode === 'below' && ctx.selectedItem && (
				<Card>
					<CardHeader>
						<CardTitle>Edit Product: {ctx.selectedItem.name}</CardTitle>
					</CardHeader>
					<CardContent>
						<ProductForm
							initialData={ctx.selectedItem}
							onSubmit={handleSaveBelow}
							onCancel={() => ctx.setSelectedItemId(undefined)}
							submitLabel="Update Product"
						/>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	);
}
