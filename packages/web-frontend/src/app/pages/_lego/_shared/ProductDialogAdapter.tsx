import { useEffect, useState } from 'react';

import type { CrudDialogProps } from '@framework/lego/types/FeatureTypes';
import type { CreateProduct, Product } from '@shared/api/products.contract';

import { ProductDialog } from './ProductDialog';

/**
 * ===========================================================================================
 * PRODUCT DIALOG ADAPTER
 * ===========================================================================================
 *
 * Adapts ProductDialog to work with CrudDialogProps interface.
 * Bridges the gap between Lego framework expectations and domain-specific dialog props.
 *
 * CrudDialogProps: { item, onSave, onClose }
 * ProductDialog props: { open, onClose, item, onSave, onRefresh, isRefreshing }
 *
 * ===========================================================================================
 */

export function ProductDialogAdapter({ item, onSave, onClose }: CrudDialogProps) {
	const [open, setOpen] = useState(true);

	useEffect(() => {
		setOpen(true);
	}, []);

	const handleClose = () => {
		setOpen(false);
		setTimeout(onClose, 100);
	};

	const handleSave = async (data: CreateProduct) => {
		await onSave(data);
		handleClose();
	};

	return <ProductDialog open={open} onClose={handleClose} item={item as Product | null} onSave={handleSave} />;
}
