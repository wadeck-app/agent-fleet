import type { TableColumn } from '@framework/components/table/Table';

// Add comment above the target line, not at the end
/**
 * Apply column order to columns array
 * Returns a new array with columns reordered according to columnOrder
 *
 * @param columns - Array of table columns
 * @param order - Desired order of column keys
 * @returns Reordered columns array with any unordered columns appended at the end
 */
export function applyColumnOrder<T>(columns: TableColumn<T>[], order: string[]): TableColumn<T>[] {
	const columnMap = new Map(columns.map(col => [col.key, col]));

	// Build ordered array based on order
	const orderedColumns: TableColumn<T>[] = [];
	for (const key of order) {
		const column = columnMap.get(key);
		if (column) {
			orderedColumns.push(column);
			columnMap.delete(key);
		}
	}

	// Append any columns not in order (new columns added to code)
	const remainingColumns = Array.from(columnMap.values());

	return [...orderedColumns, ...remainingColumns];
}
