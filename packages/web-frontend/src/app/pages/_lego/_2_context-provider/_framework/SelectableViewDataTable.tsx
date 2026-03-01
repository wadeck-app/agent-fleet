import { useMemo } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { DataTableFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Eye } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';
import { ViewDataTable } from './ViewDataTable';

/**
 * ===========================================================================================
 * SELECTABLE VIEW DATA TABLE
 * ===========================================================================================
 *
 * Extension of ViewDataTable that adds a "View" action column for row selection.
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

	/**
	 * Add a "View" action column
	 */
	const columnsWithAction: ColumnDef<T>[] = useMemo(
		() => [
			...columns,
			{
				key: '__select__' as keyof T & string,
				label: 'Actions',
				type: 'custom',
				render: (item: T) => (
					<Button variant="ghost" size="sm" onClick={() => context.actions.select(item as any)}>
						<Eye className="mr-2 size-4" />
						View
					</Button>
				),
			},
		],
		[columns, context.actions]
	);

	return <ViewDataTable columns={columnsWithAction} features={features} enableRowClick />;
}
