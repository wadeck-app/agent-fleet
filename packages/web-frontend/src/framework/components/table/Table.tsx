import { type ReactNode } from 'react';

import { type ColumnDef, ColumnVisibility } from '../columns/ColumnVisibility';
import { useColumnVisibility } from '../columns/useColumnVisibility';
import { PageSizeSelector } from '../pagination/PageSizeSelector';
import { Pagination } from '../pagination/Pagination';
import { SortableColumnHeader } from './SortableColumnHeader';
import { TableBody } from './TableBody';
import { TableHeader } from './TableHeader';
import { useTableSelection } from './useTableSelection';
import type { SortDirection } from './useTableSorting';

export interface TableColumn<T> {
	key: string;
	label: string | ReactNode;
	render: (item: T, isEditing: boolean) => ReactNode;
	className?: string;
	// For sortable columns
	sortable?: boolean;
	// For column visibility
	canHide?: boolean;
	defaultVisible?: boolean;
}

// Pagination config (controlled by parent)
export interface TablePaginationConfig {
	currentPage: number;
	totalPages: number;
	totalItems: number;
	onPageChange: (page: number) => void;
	// Page size selector (optional)
	pageSize?: number;
	onPageSizeChange?: (pageSize: number) => void;
	pageSizeOptions?: number[];
}

// Sorting config (controlled by parent)
export interface TableSortConfig {
	key: string;
	direction: 'asc' | 'desc';
}

export interface TableSortingConfig {
	sortConfigs: TableSortConfig[];
	onSortChange: (key: string, shiftKey: boolean) => void;
}

export interface TableProps<T> {
	data: T[];
	columns: TableColumn<T>[];
	getItemId: (item: T) => string;

	// Selection
	selectable?: boolean;
	selectedIds?: Set<string>;
	onSelectionChange?: (selectedIds: Set<string>) => void;

	// Deleting state (for strike-through styling)
	deletingIds?: Set<string>;

	// Actions
	renderActions?: (item: T, isEditing: boolean) => ReactNode;

	// Editing
	editingId?: string | null;

	// Row classes
	getRowClassName?: (item: T) => string;

	// Row click handler
	onRowClick?: (item: T) => void;

	// Empty state
	emptyMessage?: string;

	// Loading state
	loading?: boolean;
	loadingMessage?: string;

	// Initial loading state (show skeleton rows)
	initialLoading?: boolean;

	// Refreshing state (blur effect while data is being fetched)
	refreshing?: boolean;

	// Deleting state (blur effect during bulk delete operations)
	deleting?: boolean;

	// Pagination (controlled by parent)
	pagination?: TablePaginationConfig;

	// Sorting (controlled by parent)
	sorting?: TableSortingConfig;

	// Column Visibility
	columnVisibility?: boolean;
	columnVisibilityStorageKey?: string;
	defaultVisibleColumns?: string[];

	// Column Visibility Render Prop (allows parent to control where it's rendered)
	renderColumnVisibility?: (columnVisibilityElement: ReactNode) => ReactNode;
}

export function Table<T>({
	data,
	columns,
	getItemId,
	selectable = false,
	selectedIds = new Set(),
	onSelectionChange,
	deletingIds = new Set(),
	renderActions,
	editingId = null,
	getRowClassName,
	onRowClick,
	emptyMessage = 'No data available',
	loading = false,
	loadingMessage = 'Loading...',
	initialLoading = false,
	refreshing = false,
	deleting = false,
	pagination,
	sorting,
	columnVisibility = false,
	columnVisibilityStorageKey = 'table',
	defaultVisibleColumns,
	renderColumnVisibility,
}: TableProps<T>) {
	const allColumnIds = columns.map(col => col.key);

	// Always call the hook, but use a flag to determine if we use its result
	const columnVisibilityHook = useColumnVisibility(allColumnIds, {
		storageId: columnVisibilityStorageKey,
		defaultVisible: defaultVisibleColumns ?? allColumnIds,
	});

	// Filter visible columns
	const visibleColumns = columnVisibility
		? columns.filter(col => columnVisibilityHook.visibleColumns.has(col.key))
		: columns;

	// Get sort info for a column
	const getSortInfo = (key: string): { direction: SortDirection; priority: number | null } => {
		if (!sorting) {
			return { direction: null, priority: null };
		}
		const index = sorting.sortConfigs.findIndex(config => config.key === key);
		if (index < 0) {
			return { direction: null, priority: null };
		}
		const config = sorting.sortConfigs[index];
		if (!config) {
			return { direction: null, priority: null };
		}
		return {
			direction: config.direction,
			priority: sorting.sortConfigs.length > 1 ? index + 1 : null,
		};
	};

	// Add sortable headers if sorting is enabled
	const columnsWithSort = sorting
		? visibleColumns.map(col => {
				const { direction, priority } = getSortInfo(col.key);
				return {
					...col,
					label:
						col.sortable !== false ? (
							<SortableColumnHeader
								label={col.label}
								sortDirection={direction}
								priority={priority}
								onClick={e => sorting.onSortChange(col.key, e.shiftKey)}
							/>
						) : (
							col.label
						),
				} as TableColumn<T>;
			})
		: (visibleColumns.map(col => ({
				...col,
				label: col.label,
			})) as TableColumn<T>[]);

	// Selection
	const { selectAllCheckboxRef, handleToggleSelection, handleToggleSelectAll, isAllSelected, isSomeSelected } =
		useTableSelection({
			data,
			selectedIds,
			onSelectionChange,
			getItemId,
		});

	// Column definitions for visibility control
	const columnDefs: ColumnDef[] = columns.map(col => ({
		id: col.key,
		label: col.label,
		canHide: col.canHide,
	}));

	// Column visibility element
	const columnVisibilityElement =
		columnVisibility && columnVisibilityHook ? (
			<ColumnVisibility
				columns={columnDefs}
				visibleColumns={columnVisibilityHook.visibleColumns}
				defaultVisible={defaultVisibleColumns ? new Set(defaultVisibleColumns) : undefined}
				onToggle={columnVisibilityHook.toggleColumn}
				onReset={columnVisibilityHook.resetColumns}
				onShowAll={columnVisibilityHook.showAll}
				onHideAll={columnVisibilityHook.hideAll}
			/>
		) : null;

	return (
		<div className="space-y-4">
			{/* Column Visibility - Custom Render */}
			{renderColumnVisibility && columnVisibilityElement && renderColumnVisibility(columnVisibilityElement)}

			{/* Table with Border */}
			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<div className="w-full overflow-x-auto">
					<table className="w-full border-collapse">
						<TableHeader
							columns={columnsWithSort}
							selectable={selectable}
							renderActions={!!renderActions}
							selectAllChecked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
							selectAllDisabled={data.length === 0}
							selectAllCheckboxRef={selectAllCheckboxRef}
							onToggleSelectAll={handleToggleSelectAll}
						/>
						<TableBody
							data={data}
							columns={columnsWithSort}
							getItemId={getItemId}
							loading={loading}
							initialLoading={initialLoading}
							refreshing={refreshing}
							deleting={deleting}
							emptyMessage={emptyMessage}
							loadingMessage={loadingMessage}
							selectable={selectable}
							selectedIds={selectedIds}
							deletingIds={deletingIds}
							editingId={editingId}
							getRowClassName={getRowClassName}
							renderActions={renderActions}
							onToggleSelection={handleToggleSelection}
							onRowClick={onRowClick}
						/>
					</table>
				</div>
			</div>

			{/* Pagination - Outside Border */}
			{pagination && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{(() => {
							// Use pageSize when available, fallback to calculated value for backward compatibility
							const perPage =
								pagination.pageSize ?? Math.ceil(pagination.totalItems / pagination.totalPages);
							const startItem = data.length > 0 ? (pagination.currentPage - 1) * perPage + 1 : 0;
							const endItem = Math.min(pagination.currentPage * perPage, pagination.totalItems);

							return (
								<>
									Showing {startItem} to {endItem} of {pagination.totalItems} items
								</>
							);
						})()}
					</div>
					<div className="flex items-center gap-4">
						{/* Page Size Selector */}
						{pagination.pageSize !== undefined && pagination.onPageSizeChange && (
							<PageSizeSelector
								value={pagination.pageSize}
								onChange={pagination.onPageSizeChange}
								options={pagination.pageSizeOptions || [5, 10, 20, 50]}
								size="sm"
							/>
						)}
						<div className="text-sm text-muted-foreground">
							Page {pagination.currentPage} of {pagination.totalPages}
						</div>
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
