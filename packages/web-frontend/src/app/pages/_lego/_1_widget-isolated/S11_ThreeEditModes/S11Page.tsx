import { useState } from 'react';

import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego/helpers/col';
import type { DataTableFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { PageLayout } from '../_framework/PageEventContext';
import { WidgetDataTable } from '../_framework/WidgetDataTable';

/**
 * ===========================================================================================
 * S11: THREE EDIT MODES
 * ===========================================================================================
 *
 * Three buttons at the top of the page: "Dialog", "Inline", "Below Form"
 * - "Dialog" = standard modal dialog (same as S3)
 * - "Inline" = edit directly in table row
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

export function S11Page() {
	const [editMode, setEditMode] = useState<EditMode>('dialog');
	const [editingProduct, setEditingProduct] = useState<Product | null>(null);

	const handleSaveBelow = async (data: any) => {
		if (editingProduct) {
			await productsService.updateProduct(editingProduct.id, {
				...data,
				version: editingProduct.version,
			});
			setEditingProduct(null);
		}
	};

	// Note: inline-edit as DataTableFeature is not implemented -- 'inline' falls back to dialog
	const features = ((): DataTableFeature[] => {
		if (editMode === 'below') {
			return ['search', 'pagination', { type: 'sorting', multi: true }, 'column-visibility', 'bulk-delete'];
		}
		return [
			'search',
			'pagination',
			{ type: 'sorting', multi: true },
			'column-visibility',
			'bulk-delete',
			{ type: 'crud', dialog: ProductDialogAdapter },
		];
	})();

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
					<PageLayout>
						<WidgetDataTable service={productsService} columns={columns} features={features} />
					</PageLayout>
				</CardContent>
			</Card>

			{editMode === 'below' && editingProduct && (
				<Card>
					<CardHeader>
						<CardTitle>Edit Product: {editingProduct.name}</CardTitle>
					</CardHeader>
					<CardContent>
						<ProductForm
							initialData={editingProduct}
							onSubmit={handleSaveBelow}
							onCancel={() => setEditingProduct(null)}
							submitLabel="Update Product"
						/>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	);
}
