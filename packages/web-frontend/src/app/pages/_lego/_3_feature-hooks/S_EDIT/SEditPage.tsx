import { useRef, useState } from 'react';

import { PageContainer } from '@framework/components/layout/PageContainer';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { col } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { ProductDialogAdapter } from '@app/pages/_lego/_shared/ProductDialogAdapter';
import { ProductForm } from '@app/pages/_lego/_shared/ProductForm';
import { productsService } from '@app/pages/_lego/_shared/api/ProductsService';

import { HookDataTable } from '../_framework/HookDataTable';
import { PageLayout } from '../_framework/PageLayout';
import { useBulkDeleteFeature } from '../_framework/useBulkDeleteFeature';
import { useColumnVisibilityFeature } from '../_framework/useColumnVisibilityFeature';
import { useCrudFeature } from '../_framework/useCrudFeature';
import { usePaginationFeature } from '../_framework/usePaginationFeature';
import { useSearchFeature } from '../_framework/useSearchFeature';
import { useSortingFeature } from '../_framework/useSortingFeature';

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

export function SEditPage() {
	const [editMode, setEditMode] = useState<EditMode>('dialog');
	const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

	const search = useSearchFeature();
	const pagination = usePaginationFeature({ defaultSize: 10 });
	const sorting = useSortingFeature();
	const columnVisibility = useColumnVisibilityFeature();
	const bulkDelete = useBulkDeleteFeature();
	const crud = useCrudFeature(ProductDialogAdapter);

	const refreshRef = useRef<(() => void) | undefined>(undefined);

	const handleRowSelect = (id: string, items: Product[]) => {
		const product = items.find(p => p.id === id);
		if (product && editMode === 'below') {
			setSelectedProduct(product);
		}
	};

	const handleSaveBelow = async (data: any) => {
		if (selectedProduct) {
			await productsService.updateProduct(selectedProduct.id, {
				...data,
				version: selectedProduct.version,
			});
			setSelectedProduct(null);
			refreshRef.current?.();
		}
	};

	const features =
		editMode === 'below'
			? [search, pagination, sorting, columnVisibility, bulkDelete]
			: [search, pagination, sorting, columnVisibility, bulkDelete, crud];

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
					<PageLayout>
						<HookDataTable
							service={productsService}
							columns={columns}
							features={features}
							onRefreshRef={refreshRef}
							onRowSelect={editMode === 'below' ? id => handleRowSelect(id, []) : undefined}
							onItemsLoaded={items => {
								if (editMode === 'below') {
									const id = selectedProduct?.id;
									if (id) {
										handleRowSelect(id, items);
									}
								}
							}}
						/>
					</PageLayout>
				</CardContent>
			</Card>

			{editMode === 'below' && selectedProduct && (
				<Card>
					<CardHeader>
						<CardTitle>Edit Product: {selectedProduct.name}</CardTitle>
					</CardHeader>
					<CardContent>
						<ProductForm
							initialData={selectedProduct}
							onSubmit={handleSaveBelow}
							onCancel={() => setSelectedProduct(null)}
							submitLabel="Update Product"
						/>
					</CardContent>
				</Card>
			)}
		</PageContainer>
	);
}
