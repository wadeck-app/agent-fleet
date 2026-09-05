import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { Product } from '@shared/api/products.contract';
import { Plus } from 'lucide-react';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { usePipelineContext } from '../_framework/PipelineContext';
import { PipelineCrudBody } from '../_framework/PipelineCrudBody';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';

type EditMode = 'dialog' | 'inline' | 'below';

export function S11Content({ editMode }: { editMode: EditMode }) {
	const { refresh } = usePipelineContext<Product>();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<Product | null>(null);

	const handleCreate = () => {
		setEditingItem(null);
		setDialogOpen(true);
	};

	const handleEdit = (item: Product) => {
		setEditingItem(item);
		if (editMode !== 'below') {
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
		console.log('Save:', data);
	};

	const handleSaveBelow = async (data: any) => {
		if (editingItem) {
			await productsService.updateProduct(editingItem.id, { ...data, version: editingItem.version });
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
