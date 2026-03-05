import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';
import { Plus } from 'lucide-react';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageLayout';
import { PipelineContent } from '../_framework/PipelineContent';
import { usePipelineContext } from '../_framework/PipelineContext';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineItemGrid } from '../_framework/PipelineItemGrid';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';
import { withPagination, withSearch } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S4: GRID POPUP (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Responsive grid layout with search, pagination, and CRUD operations.
 * Uses PipelineItemGrid component to display items as cards.
 *
 * Architecture:
 * - PipelineDataTable provides context with modifiers
 * - PipelineItemGrid reads items from context
 * - Page manages dialog state for CRUD operations
 *
 * Features:
 * - Search
 * - Pagination (12 items per page)
 * - Grid layout (responsive 1-4 columns)
 * - CRUD via dialog
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
		// Dialog adapter handles save logic
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

export function S4Page() {
	return (
		<PageLayout>
			<PipelineDataTable
				service={productsService}
				columns={columns}
				modifiers={[withPagination(1, 12), withSearch('')]}
			>
				<S4Content />
			</PipelineDataTable>
		</PageLayout>
	);
}
