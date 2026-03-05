import { useState } from 'react';

import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { DataTable } from '../_framework/DataTable';
import { useDataTable } from '../_framework/DataTableContext';
import { PageLayout } from '../_framework/PageLayout';

/**
 * ===========================================================================================
 * S_EDIT: THREE EDIT MODES
 * ===========================================================================================
 *
 * Mode switcher that demonstrates three different editing patterns.
 * All modes share the same table but differ in how editing is triggered and displayed.
 *
 * Modes:
 * - Dialog: Edit/Delete buttons per row open ProductDialogAdapter
 * - Inline Actions: Same as dialog (buttons per row open dialog)
 * - Form Below: Click row to show ProductForm below table
 *
 * Features:
 * - Search + pagination
 * - Dynamic mode switching
 * - All modes share the same data and refresh logic
 *
 * ===========================================================================================
 */

type EditMode = 'dialog' | 'inline' | 'below';

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

function SEditContent() {
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
						<Button
							variant={editMode === 'dialog' ? 'default' : 'outline'}
							onClick={() => setEditMode('dialog')}
						>
							Dialog
						</Button>
						<Button
							variant={editMode === 'inline' ? 'default' : 'outline'}
							onClick={() => setEditMode('inline')}
						>
							Inline Actions
						</Button>
						<Button
							variant={editMode === 'below' ? 'default' : 'outline'}
							onClick={() => setEditMode('below')}
						>
							Form Below
						</Button>
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

export function SEditPage() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={columns} enableCrud={true} enableSorting={true}>
				<SEditContent />
			</DataTable>
		</PageLayout>
	);
}
