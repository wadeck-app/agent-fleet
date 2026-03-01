import { useEffect, useState } from 'react';

import type { CrudDialogProps } from '@framework/lego/types/FeatureTypes';
import type { CreateProduct, Product } from '@shared/api/products.contract';

import { ProductDialog } from '@app/pages/_lego/_shared/ProductDialog';

/**
 * ===========================================================================================
 * PRODUCT DIALOG ADAPTER
 * ===========================================================================================
 *
 * Adapts ProductDialog (which requires an `open` prop) to match the CrudDialogProps interface
 * (which doesn't have an `open` prop - it's controlled by the parent).
 *
 * This adapter manages the open state internally based on whether item changes.
 *
 * ===========================================================================================
 */

export function ProductDialogAdapter({ item, onSave, onClose }: CrudDialogProps) {
	const [open, setOpen] = useState(false);

	/**
	 * Open dialog when item changes (either set to create mode or edit mode)
	 */
	useEffect(() => {
		setOpen(true);
	}, [item]);

	const handleClose = () => {
		setOpen(false);
		setTimeout(() => {
			onClose();
		}, 300);
	};

	const handleSave = async (data: CreateProduct) => {
		await onSave(data);
		handleClose();
	};

	return <ProductDialog open={open} onClose={handleClose} item={item as Product | null} onSave={handleSave} />;
}
