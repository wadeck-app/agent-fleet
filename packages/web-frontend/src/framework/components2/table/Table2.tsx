/**
 * ===========================================================================================
 * TABLE2 COMPONENT
 * ===========================================================================================
 *
 * A pure presentation table component implementing QueryResultDisplayerProps<T>.
 * Designed for use with the Data2 shell in the headless composable architecture.
 *
 * Key differences from Table (v1):
 * - Simpler API - no selection, no column visibility
 * - Implements QueryResultDisplayerProps contract
 * - Designed to receive injected props from Data2
 * - Pure presentation (no business logic)
 *
 * Features:
 * - Data display with custom column definitions
 * - Sortable columns (if sorting feature enabled)
 * - Pagination controls (if pagination feature enabled)
 * - Loading and empty states
 * - Error display
 * - Optional row actions (edit, delete, etc.)
 *
 * Usage:
 * ```tsx
 * <Data2 fetchData={fetchIngredients} pagination={pagination} sorting={sorting}>
 *   <Table2
 *     columns={INGREDIENT_COLUMNS}
 *     getItemId={(item) => item.id}
 *     renderActions={(item) => <EditDeleteButtons item={item} />}
 *   />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */
import { type ReactNode, useMemo, useRef } from 'react';

import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { SortableColumnHeader } from '@framework/components/table/SortableColumnHeader';
import { type TableColumn as TableHeaderColumn } from '@framework/components/table/Table';
import { TableBody } from '@framework/components/table/TableBody';
import { TableHeader } from '@framework/components/table/TableHeader';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';

/**
 * Column definition for Table2
 */
export interface Table2Column<T> {
	/** Unique key for the column */
	key: string;
	/** Column header label (string, ReactNode, or undefined for custom headers) */
	label: string | ReactNode;
	/** Render function for cell content */
	render: (item: T) => ReactNode;
	/** Optional CSS class for column */
	className?: string;
	/** Whether column is sortable (default: true) */
	sortable?: boolean;
	/** Whether column can be hidden (default: true) */
	canHide?: boolean;
	/** Whether column is visible by default (default: true) */
	defaultVisible?: boolean;
	/** Whether column can be reordered (default: true) */
	canReorder?: boolean;
}

/**
 * Props for Table2 component
 * Extends QueryResultDisplayerProps to receive injected state from Data2
 */
export interface Table2Props<T> extends QueryResultDisplayerProps<T> {
	/** Column definitions */
	columns: Table2Column<T>[];
	/** Function to extract unique ID from item */
	getItemId: (item: T) => string;
	/** Optional render function for row actions (edit, delete, etc.) */
	renderActions?: (item: T) => ReactNode;
	/** Message when no data available */
	emptyMessage?: string;
	/** Enable striped rows */
	striped?: boolean;
	/** Fixed row height (optional) */
	rowHeight?: number;
	/** Additional CSS classes for the container */
	className?: string;
	/** Optional refreshing state - applies blur effect when true */
	refreshing?: boolean;
	/** Optional deleting state - applies blur effect during bulk delete */
	deleting?: boolean;
	/** IDs of items currently being deleted (for strike-through effect) */
	deletingIds?: Set<string>;
	/** Selection callback - called when user toggles row selection */
	onSelectionToggle?: (id: string) => void;
	/** Select all callback - called when user toggles select all checkbox */
	onSelectAll?: (ids: string[]) => void;
}

/**
 * Table2 - Pure presentation table component
 *
 * @template T - Type of data items
 */
export function Table2<T>({
	data,
	isLoading,
	error,
	pagination,
	sorting,
	features,
	columns,
	getItemId,
	renderActions,
	emptyMessage = 'No data available',
	striped: _striped = true,
	rowHeight: _rowHeight,
	className = '',
	refreshing,
	deleting,
	deletingIds = new Set(),
	onSelectionToggle,
	onSelectAll,
}: Table2Props<T>) {
	const selectAllCheckboxRef = useRef<HTMLButtonElement | null>(null);

	// Extract selection state from injected features
	const selection = features?.selection;
	const hasSelection = !!selection && !!onSelectionToggle;
	const selectedIds = selection?.selectedIds || new Set<string>();

	// Handle select all checkbox
	const handleToggleSelectAll = () => {
		if (!hasSelection || !onSelectAll) return;

		const currentPageIds = data.map(getItemId);
		onSelectAll(currentPageIds);
	};

	// Calculate select all checkbox state
	const currentPageIds = data.map(getItemId);
	const selectAllChecked =
		hasSelection && currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));

	// Build columns with sortable headers if sorting is enabled
	const columnsWithSort = useMemo(() => {
		if (!sorting) {
			return columns;
		}

		return columns.map(col => {
			// Skip non-sortable columns
			if (col.sortable === false) {
				return col;
			}

			// Find sort info for this column
			const sortInfo = sorting.sortConfigs.find(c => c.key === col.key);
			const sortIndex = sorting.sortConfigs.findIndex(c => c.key === col.key);
			const priority = sorting.sortConfigs.length > 1 && sortIndex >= 0 ? sortIndex + 1 : null;

			// Extract string label (SortableColumnHeader requires string)
			const labelString = typeof col.label === 'string' ? col.label : String(col.key);

			return {
				key: col.key,
				label: (
					<SortableColumnHeader
						label={labelString}
						sortDirection={sortInfo?.direction ?? null}
						priority={priority}
						onClick={e => sorting.onSortChange(col.key, e.shiftKey)}
					/>
				),
				render: col.render,
				className: col.className,
				sortable: col.sortable,
			} as Table2Column<T>;
		});
	}, [columns, sorting]);

	// Adapt columns to TableHeader/TableBody format
	const adaptedColumns = useMemo(
		() =>
			columnsWithSort.map(col => ({
				key: col.key,
				label: col.label, // Keep ReactNode for SortableColumnHeader
				render: (item: T, _isEditing: boolean) => col.render(item),
				className: col.className,
				sortable: col.sortable,
			})) as TableHeaderColumn<T>[],
		[columnsWithSort]
	);

	return (
		<div
			className={`
     space-y-4
     ${className}
   `}
		>
			{/* Error Display */}
			{error && !isLoading && (
				<div
					className={`
       rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm
       text-destructive
     `}
				>
					<strong>Error:</strong> {error}
				</div>
			)}

			{/* Table */}
			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<div className="w-full overflow-x-auto">
					<table className="w-full border-collapse">
						<TableHeader
							columns={adaptedColumns}
							selectable={hasSelection}
							renderActions={!!renderActions}
							selectAllChecked={selectAllChecked}
							selectAllDisabled={data.length === 0}
							selectAllCheckboxRef={selectAllCheckboxRef}
							onToggleSelectAll={handleToggleSelectAll}
						/>
						<TableBody
							data={data}
							columns={adaptedColumns}
							getItemId={getItemId}
							initialLoading={isLoading && data.length === 0}
							emptyMessage={emptyMessage}
							selectable={hasSelection}
							selectedIds={selectedIds}
							deletingIds={deletingIds}
							editingId={null}
							refreshing={refreshing}
							deleting={deleting}
							renderActions={renderActions ? (item: T) => renderActions(item) : undefined}
							onToggleSelection={onSelectionToggle || (() => {})}
							skeletonRowCount={pagination?.pageSize ?? 10}
						/>
					</table>
				</div>
			</div>

			{/* Pagination Controls */}
			{pagination && (
				<div className="flex items-center justify-between">
					{/* Items count */}
					<div className="text-sm text-muted-foreground">
						{data.length > 0 ? (
							<>
								Showing {(pagination.currentPage - 1) * pagination.pageSize + 1} to{' '}
								{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} of{' '}
								{pagination.totalItems} items
							</>
						) : (
							<>No items</>
						)}
					</div>

					{/* Page controls */}
					<div className="flex items-center gap-4">
						{/* Page Size Selector */}
						<PageSizeSelector
							value={pagination.pageSize}
							onChange={pagination.onPageSizeChange}
							options={pagination.pageSizeOptions || [5, 10, 20, 50]}
							size="sm"
						/>

						{/* Current page indicator */}
						<div className="text-sm text-muted-foreground">
							Page {pagination.currentPage} of {pagination.totalPages}
						</div>

						{/* Pagination buttons */}
						<Pagination
							currentPage={pagination.currentPage}
							totalPages={pagination.totalPages}
							onPageChange={pagination.onPageChange}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
