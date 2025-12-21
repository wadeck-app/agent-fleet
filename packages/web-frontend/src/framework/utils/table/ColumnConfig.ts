import type { ColumnDef } from '@framework/components/columns/ColumnVisibility';
import type { TableColumn } from '@framework/components/table/Table';

/**
 * ===========================================================================================
 * COLUMN CONFIGURATION UTILITIES
 * ===========================================================================================
 *
 * Utilities to derive column visibility configurations from TableColumn definitions.
 * Eliminates duplication by using table column definitions as the single source of truth.
 *
 * Purpose:
 * - Convert TableColumn[] → ColumnDef[] for ColumnVisibility component
 * - Extract column IDs for useColumnVisibility hook
 * - Extract default visible columns from TableColumn definitions
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
 * Converts TableColumn array to ColumnDef array for ColumnVisibility component.
 *
 * Maps table column definitions to the format expected by the ColumnVisibility UI component.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Array of column definitions for the ColumnVisibility component
 *
 * @example
 * ```typescript
 * const tableColumns = defineColumns<Book>([
 *   ColumnHelpers.string('title', 'Title'),
 *   ColumnHelpers.string('author', 'Author', { canHide: false }),
 * ]);
 *
 * const visibilityDefs = toColumnVisibilityDefs(tableColumns);
 * // Result: [
 * //   { id: 'title', label: 'Title', canHide: true },
 * //   { id: 'author', label: 'Author', canHide: false }
 * // ]
 * ```
 */
export function toColumnVisibilityDefs<T>(columns: TableColumn<T>[]): ColumnDef[] {
	return columns.map(col => ({
		id: col.key,
		label: col.label,
		canHide: col.canHide ?? true,
	}));
}

/**
 * Extracts column IDs from TableColumn array.
 *
 * Useful for passing to useColumnVisibility hook's first parameter (allColumns).
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Array of column IDs (keys)
 *
 * @example
 * ```typescript
 * const tableColumns = defineColumns<Book>([
 *   ColumnHelpers.string('title', 'Title'),
 *   ColumnHelpers.string('author', 'Author'),
 * ]);
 *
 * const columnIds = extractColumnIds(tableColumns);
 * // Result: ['title', 'author']
 *
 * const visibility = useColumnVisibility(columnIds, { storageId: 'books' });
 * ```
 */
export function extractColumnIds<T>(columns: TableColumn<T>[]): string[] {
	return columns.map(col => col.key);
}

/**
 * Extracts default visible column IDs from TableColumn array.
 *
 * Filters columns that have defaultVisible=true and returns their IDs.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Array of column IDs that should be visible by default
 *
 * @example
 * ```typescript
 * const tableColumns = defineColumns<Book>([
 *   ColumnHelpers.string('id', 'ID'),
 *   ColumnHelpers.string('title', 'Title', { defaultVisible: true }),
 * ]);
 *
 * const defaultVisible = extractDefaultVisible(tableColumns);
 * // Result: ['title']
 * ```
 */
export function extractDefaultVisible<T>(columns: TableColumn<T>[]): string[] {
	return columns.filter(col => col.defaultVisible ?? false).map(col => col.key);
}

/**
 * Extracts column constraints (canHide) from TableColumn array.
 *
 * Returns a map of column IDs to their canHide constraints for use in useColumnVisibility hook.
 *
 * @template T - The type of data displayed in the table
 * @param columns - Array of table column definitions
 * @returns Record mapping column IDs to their canHide constraint
 *
 * @example
 * ```typescript
 * const tableColumns = defineColumns<Book>([
 *   ColumnHelpers.string('id', 'ID', { canHide: false }),
 *   ColumnHelpers.string('title', 'Title'),
 * ]);
 *
 * const constraints = extractCanHideConstraints(tableColumns);
 * // Result: { id: { canHide: false }, title: { canHide: true } }
 * ```
 */
export function extractCanHideConstraints<T>(columns: TableColumn<T>[]): Record<string, { canHide: boolean }> {
	return columns.reduce(
		(acc, col) => {
			acc[col.key] = { canHide: col.canHide ?? true };
			return acc;
		},
		{} as Record<string, { canHide: boolean }>
	);
}
