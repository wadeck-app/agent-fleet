import type { ReactNode } from 'react';

import type { ColumnDef } from '@framework/lego';
import { renderColumnValue } from '@framework/lego';

import { useDataTable } from './DataTableContext';

/**
 * ===========================================================================================
 * DETAIL PANEL - Display Selected Item Details
 * ===========================================================================================
 *
 * Displays details of the currently selected item from the DataTable context.
 * Automatically reacts to context changes.
 *
 * Usage:
 * ```tsx
 * <DetailPanel columns={detailColumns} />
 * ```
 *
 * ===========================================================================================
 */

export interface DetailPanelProps<T> {
	columns: ColumnDef<T>[];
	emptyMessage?: ReactNode;
}

export function DetailPanel<T extends { id: string }>({
	columns,
	emptyMessage = 'Select an item to view details',
}: DetailPanelProps<T>) {
	const ctx = useDataTable<T>();

	const selectedItem = ctx.items.find(item => item.id === ctx.selectedItemId);

	if (!ctx.selectedItemId || !selectedItem) {
		return <div className="flex h-full items-center justify-center text-muted-foreground">{emptyMessage}</div>;
	}

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<h3 className="text-lg font-semibold">Details</h3>
			<div className="flex flex-col gap-3">
				{columns.map(col => (
					<div key={String(col.key)} className="flex flex-col gap-1">
						<div className="text-sm font-medium text-muted-foreground">{col.label}</div>
						<div className="text-sm">{renderColumnValue(col, selectedItem)}</div>
					</div>
				))}
			</div>
		</div>
	);
}
