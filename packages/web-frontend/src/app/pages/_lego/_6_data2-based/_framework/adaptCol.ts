import type { Table2Column } from '@framework/components2/table/Table2';
import { type ColumnDef, renderColumnValue } from '@framework/lego';

/**
 * ===========================================================================================
 * ADAPT COL - Lego ColumnDef → Table2Column Adapter
 * ===========================================================================================
 *
 * Adapts a lego ColumnDef (from col.text(), col.enum(), etc.) to Table2Column format.
 * Preserves the same rendering logic (badges, dates, numbers, boolean icons) as A1's
 * WidgetDataTable, while staying compatible with Table2's API.
 *
 * This ensures pixel-perfect visual parity between A1 (widget-isolated) and A6 (data2-based)
 * approaches for visual regression tests.
 *
 * Usage:
 * ```tsx
 * import { col } from '@framework/lego';
 * import { adaptCol } from './_framework/adaptCol';
 *
 * const columns = [
 *   adaptCol(col.text<Product>('name', 'Name', { sortable: true })),
 *   adaptCol(col.number<Product>('price', 'Price', { prefix: '$', sortable: true })),
 *   adaptCol(col.enum<Product>('status', 'Status', STATUSES, { badge: true })),
 *   adaptCol(col.boolean<Product>('featured', 'Featured')),
 *   adaptCol(col.date<Product>('createdAt', 'Created')),
 * ];
 * ```
 *
 * ===========================================================================================
 */
export function adaptCol<T>(columnDef: ColumnDef<T>): Table2Column<T> {
	return {
		key: columnDef.key as string,
		label: columnDef.label,
		render: (item: T) => renderColumnValue(columnDef, item),
		sortable: columnDef.sortable,
		className: columnDef.sticky ? `sticky-${columnDef.sticky}` : undefined,
	};
}
