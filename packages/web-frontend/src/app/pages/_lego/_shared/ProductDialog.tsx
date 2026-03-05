import { useMemo } from 'react';

import type { CreateProduct, Product } from '@shared/api/products.contract';

import { EntityDialog } from '@app/components/domain/EntityDialog';

import { ProductForm } from './ProductForm';

/**
 * ===========================================================================================
 * PRODUCT DIALOG - Domain Component
 * ===========================================================================================
 *
 * Wraps ProductForm in an EntityDialog for consistent dialog behavior.
 * - Uses EntityDialog for structure, title generation, and header actions
 * - Prepares initial data for ProductForm in edit mode
 * - Delegates all form logic to ProductForm
 *
 * Usage:
 * ```tsx
 * <ProductDialog
 *   open={isOpen}
 *   onClose={() => navigate('/products')}
 *   product={editingProduct}
 *   onSubmit={handleSubmit}
 *   onRefresh={handleRefresh}
 * />
 * ```
 *
 * Props:
 * - item: Product | null (null = create mode, Product = edit mode)
 * - onSave: (data: CreateProduct | UpdateProduct) => Promise<void>
 * - onClose: () => void
 * - onRefresh: () => void (optional, for edit mode)
 * - isRefreshing: boolean (optional)
 *
 * ===========================================================================================
 */

export interface ProductDialogProps {
	open: boolean;
	onClose: () => void;
	item?: Product | null;
	onSave: (data: CreateProduct) => Promise<void>;
	onRefresh?: () => void;
	isRefreshing?: boolean;
}

export function ProductDialog({ open, onClose, item, onSave, onRefresh, isRefreshing = false }: ProductDialogProps) {
	// Determine mode based on whether an item is being edited
	const isEditMode = !!item;

	// Prepare initial data for the form (only in edit mode)
	// Memoized to prevent unnecessary form resets
	const initialData = useMemo(() => {
		if (!item) {
			return undefined;
		}
		return {
			name: item.name,
			description: item.description,
			category: item.category,
			price: item.price,
			stock: item.stock,
			status: item.status,
			rating: item.rating,
			imageUrl: item.imageUrl,
			featured: item.featured,
		};
	}, [item]);

	// Set submit label based on mode
	const submitLabel = isEditMode ? 'Update Product' : 'Create Product';

	return (
		<EntityDialog
			open={open}
			onClose={onClose}
			entity={item}
			entityName="Product"
			onRefresh={onRefresh}
			isRefreshing={isRefreshing}
			maxWidth="2xl"
		>
			<ProductForm onSubmit={onSave} onCancel={onClose} initialData={initialData} submitLabel={submitLabel} />
		</EntityDialog>
	);
}
