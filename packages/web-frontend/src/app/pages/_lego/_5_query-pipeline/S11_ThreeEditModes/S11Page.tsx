import { useState } from 'react';

import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Plus } from 'lucide-react';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { usePipelineContext } from '../_framework/PipelineContext';
import { PipelineCrudBody } from '../_framework/PipelineCrudBody';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';
import { withPagination, withSearch } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S11: THREE EDIT MODES (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Three buttons at the top of the page: "Dialog", "Inline", "Below Form"
 * - "Dialog" = standard modal dialog (uses PipelineCrudBody)
 * - "Inline" = edit directly in table row (uses PipelineCrudBody, same as dialog for now)
 * - "Below Form" = editing form appears below the table (uses PipelineBody + ProductForm)
 *
 * Only ONE edit mode active at a time (buttons toggle)
 * Demonstrates that the architecture can swap interaction patterns without restructuring
 *
 * Architecture:
 * - PipelineDataTable provides context with search and pagination modifiers
 * - Edit mode determines which components are rendered
 * - Page manages dialog/form state and CRUD operations
 *
 * Features:
 * - Search
 * - Pagination (10 items per page)
 * - Dynamic edit mode switching
 * - Three editing patterns: dialog, inline buttons, below-table form
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

function S11Content({ editMode }: { editMode: EditMode }) {
	const { refresh } = usePipelineContext<Product>();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<Product | null>(null);

	const handleCreate = () => {
		setEditingItem(null);
		setDialogOpen(true);
	};

	const handleEdit = (item: Product) => {
		setEditingItem(item);
		if (editMode === 'below') {
			// For below mode, just set editing item (no dialog)
		} else {
			setDialogOpen(true);
		}
	};

	const handleDelete = async (item: Product) => {
		if (confirm('Delete this item?')) {
			await productsService.deleteProduct(item.id);
			refresh();
		}
	};

	const handleDialogClose = () => {
		setDialogOpen(false);
		setEditingItem(null);
		refresh();
	};

	const handleDialogSave = async (data: any) => {
		// Dialog adapter handles save logic
		console.log('Save:', data);
	};

	const handleSaveBelow = async (data: any) => {
		if (editingItem) {
			await productsService.updateProduct(editingItem.id, {
				...data,
				version: editingItem.version,
			});
			setEditingItem(null);
			refresh();
		}
	};

	return (
		<>
			<PipelineContent>
				<PipelineToolbar>
					<PipelineSearch />
					<Button onClick={handleCreate}>
						<Plus className="size-4" />
						Add
					</Button>
				</PipelineToolbar>
				{editMode === 'below' ? (
					<PipelineBody showPagination onRowClick={handleEdit} showCursor />
				) : (
					<PipelineCrudBody showPagination onEdit={handleEdit} onDelete={handleDelete} />
				)}
			</PipelineContent>

			{dialogOpen && (
				<ProductDialogAdapter item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}

			{editMode === 'below' && editingItem && (
				<Card>
					<CardHeader>
						<CardTitle>Edit Product: {editingItem.name}</CardTitle>
					</CardHeader>
					<CardContent>
						<ProductForm
							initialData={editingItem}
							onSubmit={handleSaveBelow}
							onCancel={() => setEditingItem(null)}
							submitLabel="Update Product"
						/>
					</CardContent>
				</Card>
			)}
		</>
	);
}

export function S11Page() {
	const [editMode, setEditMode] = useState<EditMode>('dialog');

	return (
		<PageContainer maxWidth="full" spacing="md">
			<Card>
				<CardHeader>
					<CardTitle>Edit Mode Selector</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex gap-2">
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
					<PageLayout>
						<PipelineDataTable
							service={productsService}
							columns={columns}
							modifiers={[withSearch(''), withPagination(1, 10)]}
						>
							<S11Content editMode={editMode} />
						</PipelineDataTable>
					</PageLayout>
				</CardContent>
			</Card>
		</PageContainer>
	);
}
