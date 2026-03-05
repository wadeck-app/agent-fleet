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
 * S11: THREE EDIT MODES
 * ===========================================================================================
 *
 * Three buttons at the top of the page: "Dialog", "Inline", "Below Form"
 * - "Dialog" = standard modal dialog (same as S3)
 * - "Inline" = edit directly in table row (not fully implemented, same as dialog for now)
 * - "Below Form" = editing form appears below the table
 *
 * Only ONE edit mode active at a time (buttons toggle)
 * Demonstrates that the architecture can swap interaction patterns without restructuring
 *
 * Features:
 * - search
 * - pagination
 * - sorting (multi-column)
 * - column-visibility
 * - bulk-delete
 * - Dynamic edit mode switching
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

function S11Content() {
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
							Inline
						</Button>
						<Button
							variant={editMode === 'below' ? 'default' : 'outline'}
							onClick={() => setEditMode('below')}
						>
							Below Form
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

export function S11Page() {
	return (
		<PageLayout>
			<DataTable service={productsService} columns={columns} enableSorting={true} enableCrud={true}>
				<S11Content />
			</DataTable>
		</PageLayout>
	);
}
