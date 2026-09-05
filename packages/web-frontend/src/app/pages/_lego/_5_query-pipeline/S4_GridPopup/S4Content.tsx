import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { Product } from '@shared/api/products.contract';
import { Plus } from 'lucide-react';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PipelineContent } from '../_framework/PipelineContent';
import { usePipelineContext } from '../_framework/PipelineContext';
import { PipelineItemGrid } from '../_framework/PipelineItemGrid';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';

export function S4Content() {
	const { refresh } = usePipelineContext<Product>();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<Product | null>(null);

	const handleCreate = () => {
		setEditingItem(null);
		setDialogOpen(true);
	};

	const handleEdit = (item: Product) => {
		setEditingItem(item);
		setDialogOpen(true);
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
				<PipelineItemGrid onEdit={handleEdit} onDelete={handleDelete} showPagination />
			</PipelineContent>

			{dialogOpen && (
				<ProductDialogAdapter item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</>
	);
}
