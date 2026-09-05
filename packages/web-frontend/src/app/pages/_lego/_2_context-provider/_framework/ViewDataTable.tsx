import { useMemo, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type {
	BulkDeleteConfig,
	ColumnVisibilityConfig,
	CrudConfig,
	DataTableFeature,
	PaginationConfig,
	SearchConfig,
	SortingConfig,
} from '@framework/lego/types/FeatureTypes';
import { renderColumnValue } from '@framework/lego/helpers/renderColumnValue';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Edit, Plus, Trash2 } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';

/**
 * ===========================================================================================
 * VIEW DATA TABLE
 * ===========================================================================================
 *
 * Data table view component that reads from ProductDomainContext.
 * NO service prop, NO data prop - reads everything from context.
 *
 * Features:
 * - search: Search input in toolbar
 * - pagination: Pagination controls
 * - sorting: Multi-column sorting
 * - column-visibility: Show/hide columns
 * - column-reordering: Drag to reorder columns
 * - bulk-delete: Select multiple rows and delete
 * - crud: Create/edit/delete operations with dialog
 *
 * Renders:
 * - Toolbar: search, column controls, create button
 * - Table: rows with sort headers, checkboxes
 * - Footer: pagination, bulk bar
 * - CRUD: calls context.actions.create/update/delete
 *
 * ===========================================================================================
 * DESIGN NOTES - Approach A2 Trade-offs
 * ===========================================================================================
 *
 * A2.d - Complexity Layer:
 * A2 adds a complexity layer vs A1 (the Provider). The provider becomes a factory
 * when features grow - each new feature requires expanding the provider interface.
 * This creates coupling between the provider and all consuming views.
 *
 * ===========================================================================================
 */

export interface ViewDataTableProps<T = Product> {
	columns: ColumnDef<T>[];
	features: DataTableFeature[];
	enableRowClick?: boolean;
	onRowClick?: (item: T) => void;
}

export function ViewDataTable<T extends Product = Product>({
	columns,
	features,
	enableRowClick = false,
	onRowClick,
}: ViewDataTableProps<T>) {
	const context = useProductDomain();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<T | null>(null);
	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(columns.map(c => c.key as string)));

	const searchConfig = features
		.map(f => resolveFeature<SearchConfig>(f as string | SearchConfig, 'search'))
		.find(Boolean);
	const paginationConfig = features
		.map(f => resolveFeature<PaginationConfig>(f as string | PaginationConfig, 'pagination'))
		.find(Boolean);
	const sortingConfig = features
		.map(f => resolveFeature<SortingConfig>(f as string | SortingConfig, 'sorting'))
		.find(Boolean);
	const columnVisibilityConfig = features
		.map(f => resolveFeature<ColumnVisibilityConfig>(f as string | ColumnVisibilityConfig, 'column-visibility'))
		.find(Boolean);
	const bulkDeleteConfig = features
		.map(f => resolveFeature<BulkDeleteConfig>(f as string | BulkDeleteConfig, 'bulk-delete'))
		.find(Boolean);
	const crudConfig = features.map(f => resolveFeature<CrudConfig>(f as string | CrudConfig, 'crud')).find(Boolean);

	/**
	 * Convert ColumnDef to TableColumn
	 */
	const tableColumns: TableColumn<T>[] = useMemo(
		() =>
			columns.map(col => ({
				key: col.key,
				label: col.label,
				sortable: col.sortable,
				render: (item: T, _isEditing: boolean) => renderColumnValue(col, item),
			})),
		[columns]
	);

	const filteredColumns = useMemo(
		() => tableColumns.filter(col => visibleColumns.has(col.key as string)),
		[tableColumns, visibleColumns]
	);

	/**
	 * Sorting state (simplified - single column for now)
	 */
	const [sortKey, setSortKey] = useState<string | undefined>(undefined);
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

	const handleSortChange = (key: string) => {
		const newDirection: 'asc' | 'desc' = sortKey === key ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
		setSortKey(key);
		setSortDirection(newDirection);
		context.actions.setQuery({ sortBy: key, sortOrder: newDirection });
	};

	/**
	 * CRUD handlers
	 */
	const handleCreate = () => {
		setEditingItem(null);
		setDialogOpen(true);
	};

	const handleEdit = (item: T) => {
		setEditingItem(item);
		setDialogOpen(true);
	};

	// NOTE A2.c: Actions return void - no toast/feedback to user on error.
	// The context actions (delete, bulkDelete) silently fail if errors occur.
	// User receives no confirmation or error message after the operation.
	const handleDelete = async (id: string) => {
		if (confirm('Delete this item?')) {
			await context.actions.delete(id);
		}
	};

	const handleBulkDelete = async () => {
		if (confirm(`Delete ${selectedIds.size} items?`)) {
			await context.actions.bulkDelete(Array.from(selectedIds));
			setSelectedIds(new Set());
		}
	};

	const handleSave = async (data: T) => {
		if (editingItem) {
			await context.actions.update(editingItem.id, data as any);
		} else {
			await context.actions.create(data as any);
		}
		setDialogOpen(false);
	};

	/**
	 * Render actions menu
	 */
	const renderActions = crudConfig
		? (item: T, _isEditing: boolean) => (
				<div className="flex gap-1">
					<Button onClick={() => handleEdit(item)} size="sm" variant="ghost">
						<Edit className="size-3" />
					</Button>
					<Button onClick={() => handleDelete(item.id)} size="sm" variant="ghost">
						<Trash2 className="size-3" />
					</Button>
				</div>
			)
		: undefined;

	return (
		<div className="flex h-full flex-col gap-4">
			{(searchConfig || columnVisibilityConfig || crudConfig) && (
				<div className="flex items-center gap-2">
					{searchConfig && (
						<SearchInput
							value={context.query.search}
							onChange={value => context.actions.setQuery({ search: value })}
							onClear={() => context.actions.setQuery({ search: '' })}
							placeholder="Search..."
							className="flex-1"
						/>
					)}
					{columnVisibilityConfig && (
						<ColumnVisibility
							columns={columns.map(c => ({ id: c.key as string, label: c.label }))}
							visibleColumns={visibleColumns}
							onToggle={id => {
								const newSet = new Set(visibleColumns);
								if (newSet.has(id)) newSet.delete(id);
								else newSet.add(id);
								setVisibleColumns(newSet);
							}}
							onReset={() => setVisibleColumns(new Set(columns.map(c => c.key as string)))}
							onShowAll={() => setVisibleColumns(new Set(columns.map(c => c.key as string)))}
							onHideAll={() => setVisibleColumns(new Set())}
						/>
					)}
					{crudConfig && (
						<Button onClick={handleCreate}>
							<Plus className="size-4" />
							Add
						</Button>
					)}
				</div>
			)}

			{bulkDeleteConfig && selectedIds.size > 0 && (
				<BulkActionBar
					selectionCount={selectedIds.size}
					selectedLabel={`${selectedIds.size} selected`}
					onCancel={() => setSelectedIds(new Set())}
				>
					<Button onClick={handleBulkDelete} variant="destructive" size="sm">
						<Trash2 className="size-4" />
						Delete
					</Button>
				</BulkActionBar>
			)}

			<Table
				data={context.items as T[]}
				columns={filteredColumns}
				getItemId={item => item.id}
				selectable={!!(bulkDeleteConfig || crudConfig)}
				selectedIds={selectedIds}
				onSelectionChange={setSelectedIds}
				renderActions={renderActions}
				loading={context.loading}
				emptyMessage="No items found"
				onRowClick={enableRowClick ? onRowClick : undefined}
				pagination={
					paginationConfig
						? {
								currentPage: context.pagination.page,
								totalPages: context.pagination.totalPages,
								totalItems: context.pagination.total,
								onPageChange: page => context.actions.setQuery({ page }),
								pageSize: context.pagination.pageSize,
								onPageSizeChange: pageSize => context.actions.setQuery({ pageSize, page: 1 }),
								pageSizeOptions: paginationConfig.pageSizes || [10, 20, 50],
							}
						: undefined
				}
				sorting={
					sortingConfig
						? {
								sortConfigs: sortKey ? [{ key: sortKey, direction: sortDirection }] : [],
								onSortChange: handleSortChange,
							}
						: undefined
				}
			/>

			{crudConfig && dialogOpen && (
				<crudConfig.dialog
					item={editingItem as any}
					onSave={handleSave as any}
					onClose={() => {
						setDialogOpen(false);
						setEditingItem(null);
					}}
				/>
			)}
		</div>
	);
}
