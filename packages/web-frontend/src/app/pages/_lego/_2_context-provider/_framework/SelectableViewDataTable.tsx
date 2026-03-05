import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { DataTableFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';

import { useProductDomain } from './ProductDomainContext';
import { ViewDataTable } from './ViewDataTable';

/**
 * ===========================================================================================
 * SELECTABLE VIEW DATA TABLE
 * ===========================================================================================
 *
 * Extension of ViewDataTable that enables row click to select items.
 * Used in master-detail scenarios where clicking a row should update context.selectedItem.
 *
 * ===========================================================================================
 */

export interface SelectableViewDataTableProps<T = Product> {
	columns: ColumnDef<T>[];
	features: DataTableFeature[];
}

export function SelectableViewDataTable<T extends Product = Product>({
	columns,
	features,
}: SelectableViewDataTableProps<T>) {
	const context = useProductDomain();

	return (
		<ViewDataTable
			columns={columns}
			features={features}
			enableRowClick
			onRowClick={item => void context.actions.selectItem(item.id)}
		/>
	);
}
