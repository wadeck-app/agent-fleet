import type { Table2Column } from '@framework/components2/table/Table2';
import type { ColumnDef } from '@framework/components/columns/ColumnVisibility';

/**
 * ===========================================================================================
 * TABLE2 COLUMN CONFIGURATION UTILITIES
 * ===========================================================================================
 *
 * Utilities to derive column visibility configurations from Table2Column definitions.
 * Eliminates duplication by using table column definitions as the single source of truth.
 *
 * Purpose:
 * - Convert Table2Column[] → ColumnDef[] for ColumnVisibility component
 * - Extract column IDs for useColumnVisibility hook
 * - Extract default visible columns from Table2Column definitions
 * - Extract constraints (canHide, canReorder) from Table2Column definitions
 * - Apply visibility and ordering transformations
 *
 * Benefits:
 * - Single source of truth (table column definitions)
 * - No manual duplication of column info
 * - Type-safe transformations
 * - Reduces maintenance burden
 *
 * ===========================================================================================
 */

/**
 * Converts Table2Column array to ColumnDef array for ColumnVisibility component.
 *
 * Maps table column definitions to the format expected by the ColumnVisibility UI component.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Array of column definitions for the ColumnVisibility component
 *
 * @example
 * ```typescript
 * const tableColumns: Table2Column<Ingredient>[] = [
 *   { key: 'name', label: 'Name', render: ..., canHide: false, canReorder: false },
 *   { key: 'calories', label: 'Calories', render: ... },
 * ];
 *
 * const visibilityDefs = toColumnVisibilityDefs(tableColumns);
 * // Result: [
 * //   { id: 'name', label: 'Name', canHide: false, canReorder: false },
 * //   { id: 'calories', label: 'Calories', canHide: true, canReorder: true }
 * // ]
 * ```
 */
export function toColumnVisibilityDefs<T>(columns: Table2Column<T>[]): ColumnDef[] {
	return columns.map(col => ({
		id: col.key,
		label: col.label,
		canHide: col.canHide ?? true,
		canReorder: col.canReorder ?? true,
	}));
}

/**
 * Extracts column IDs from Table2Column array.
 *
 * Useful for passing to useColumnVisibility hook's first parameter (allColumns).
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Array of column IDs (keys)
 *
 * @example
 * ```typescript
 * const tableColumns: Table2Column<Ingredient>[] = [
 *   { key: 'name', label: 'Name', render: ... },
 *   { key: 'calories', label: 'Calories', render: ... },
 * ];
 *
 * const columnIds = extractColumnIds(tableColumns);
 * // Result: ['name', 'calories']
 *
 * const visibility = useColumnVisibility(columnIds, { storageId: 'ingredients' });
 * ```
 */
export function extractColumnIds<T>(columns: Table2Column<T>[]): string[] {
	return columns.map(col => col.key);
}

/**
 * Extracts default visible column IDs from Table2Column array.
 *
 * Filters columns that have defaultVisible=true (or undefined, which defaults to true)
 * and returns their IDs.
 *
 * Note: Unlike v1 which defaults to false, Table2 defaults to true for better UX.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Array of column IDs that should be visible by default
 *
 * @example
 * ```typescript
 * const tableColumns: Table2Column<Ingredient>[] = [
 *   { key: 'id', label: 'ID', render: ..., defaultVisible: false },
 *   { key: 'name', label: 'Name', render: ... }, // defaultVisible: true (implicit)
 *   { key: 'calories', label: 'Calories', render: ..., defaultVisible: true },
 * ];
 *
 * const defaultVisible = extractDefaultVisible(tableColumns);
 * // Result: ['name', 'calories']
 * ```
 */
export function extractDefaultVisible<T>(columns: Table2Column<T>[]): string[] {
	return columns.filter(col => col.defaultVisible !== false).map(col => col.key);
}

/**
 * Extracts column constraints (canHide) from Table2Column array.
 *
 * Returns a map of column IDs to their canHide constraints for use in useColumnVisibility hook.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Record mapping column IDs to their canHide constraint
 *
 * @example
 * ```typescript
 * const tableColumns: Table2Column<Ingredient>[] = [
 *   { key: 'name', label: 'Name', render: ..., canHide: false },
 *   { key: 'calories', label: 'Calories', render: ... }, // canHide: true (implicit)
 * ];
 *
 * const constraints = extractCanHideConstraints(tableColumns);
 * // Result: { name: { canHide: false }, calories: { canHide: true } }
 * ```
 */
export function extractCanHideConstraints<T>(columns: Table2Column<T>[]): Record<string, { canHide: boolean }> {
	return columns.reduce(
		(acc, col) => {
			acc[col.key] = { canHide: col.canHide ?? true };
			return acc;
		},
		{} as Record<string, { canHide: boolean }>
	);
}

/**
 * Extracts column constraints (canReorder) from Table2Column array.
 *
 * Returns a map of column IDs to their canReorder constraints for use in useColumnOrder hook.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Record mapping column IDs to their canReorder constraint
 *
 * @example
 * ```typescript
 * const tableColumns: Table2Column<Ingredient>[] = [
 *   { key: 'name', label: 'Name', render: ..., canReorder: false },
 *   { key: 'calories', label: 'Calories', render: ... }, // canReorder: true (implicit)
 * ];
 *
 * const constraints = extractCanReorderConstraints(tableColumns);
 * // Result: { name: { canReorder: false }, calories: { canReorder: true } }
 * ```
 */
export function extractCanReorderConstraints<T>(columns: Table2Column<T>[]): Record<string, { canReorder: boolean }> {
	return columns.reduce(
		(acc, col) => {
			acc[col.key] = { canReorder: col.canReorder ?? true };
			return acc;
		},
		{} as Record<string, { canReorder: boolean }>
	);
}

/**
 * Apply visibility filter to Table2Column array.
 *
 * Returns a new array containing only the columns that are in the visibleColumns set.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @param visibleColumns - Set of column IDs that should be visible
 * @returns Filtered array of visible columns
 *
 * @example
 * ```typescript
 * const columns: Table2Column<Ingredient>[] = [
 *   { key: 'id', label: 'ID', render: ... },
 *   { key: 'name', label: 'Name', render: ... },
 *   { key: 'calories', label: 'Calories', render: ... },
 * ];
 *
 * const visibleColumns = new Set(['name', 'calories']);
 * const filtered = applyColumnVisibility(columns, visibleColumns);
 * // Result: [{ key: 'name', ... }, { key: 'calories', ... }]
 * ```
 */
export function applyColumnVisibility<T>(columns: Table2Column<T>[], visibleColumns: Set<string>): Table2Column<T>[] {
	return columns.filter(col => visibleColumns.has(col.key));
}

/**
 * Apply column order to Table2Column array.
 *
 * Returns a new array with columns reordered according to columnOrder.
 *
 * Handles:
 * - Columns in columnOrder but not in input array (ignored)
 * - Columns in input array but not in columnOrder (appended at end)
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @param columnOrder - Array of column IDs in desired order
 * @returns Reordered array of columns
 *
 * @example
 * ```typescript
 * const columns: Table2Column<Ingredient>[] = [
 *   { key: 'id', label: 'ID', render: ... },
 *   { key: 'name', label: 'Name', render: ... },
 *   { key: 'calories', label: 'Calories', render: ... },
 * ];
 *
 * const columnOrder = ['calories', 'name', 'id'];
 * const reordered = applyColumnOrder(columns, columnOrder);
 * // Result: [{ key: 'calories', ... }, { key: 'name', ... }, { key: 'id', ... }]
 * ```
 */
export function applyColumnOrder<T>(columns: Table2Column<T>[], columnOrder: string[]): Table2Column<T>[] {
	// Create map for fast lookup
	const columnMap = new Map(columns.map(col => [col.key, col]));

	// Build ordered array based on columnOrder
	const orderedColumns: Table2Column<T>[] = [];

	for (const key of columnOrder) {
		const column = columnMap.get(key);
		if (column) {
			orderedColumns.push(column);
			columnMap.delete(key); // Remove from map
		}
	}

	// Append any columns not in columnOrder (new columns added to code)
	const remainingColumns = Array.from(columnMap.values());

	return [...orderedColumns, ...remainingColumns];
}
