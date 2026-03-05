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
import { PipelineCrudBody } from '../_framework/PipelineCrudBody';
import { PipelineDataTable } from '../_framework/PipelineDataTable';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';
import { withPagination, withSearch } from '../_framework/PipelineTypes';

/**
 * ===========================================================================================
 * S10: INLINE EDITING (Query-Pipeline Approach)
 * ===========================================================================================
 *
 * Full-featured table with inline CRUD operations.
 * Uses PipelineCrudBody component to display table with Edit/Delete buttons.
 *
 * Architecture:
 * - PipelineDataTable provides context with search and pagination modifiers
 * - PipelineCrudBody renders table with actions column
 * - Page manages dialog state for CRUD operations
 * - On save, calls refresh() from context to reload data
 *
 * Features:
 * - Search
 * - Pagination (10 items per page)
 * - Inline CRUD buttons (Edit/Delete in actions column)
 * - Dialog-based editing
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
				<PipelineCrudBody showPagination onEdit={handleEdit} onDelete={handleDelete} />
			</PipelineContent>

			{dialogOpen && (
				<ProductDialogAdapter item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</>
	);
}

export function S10Page() {
	return (
		<PageLayout>
			<PipelineDataTable
				service={productsService}
				columns={columns}
				modifiers={[withSearch(''), withPagination(1, 10)]}
			>
				<S10Content />
			</PipelineDataTable>
		</PageLayout>
	);
}
