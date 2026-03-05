import { useMemo, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import type {
	BulkDeleteConfig,
	ColumnDef,
	ColumnVisibilityConfig,
	CrudConfig,
	DataTableFeature,
	PaginationConfig,
	SearchConfig,
	SortingConfig,
} from '@framework/lego';
import { renderColumnValue, resolveFeature } from '@framework/lego';
import type { Product } from '@shared/api/products.contract';
import { Edit, Plus, Trash2 } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';

/**
 * ===========================================================================================
 * ROW-CLICK VIEW DATA TABLE
 * ===========================================================================================
 *
 * Extension of ViewDataTable that adds row-click selection behavior.
 * Used in master-detail scenarios where clicking a row should update context.selectedItem.
 *
 * Unlike SelectableViewDataTable, this does NOT add an extra "Actions" column.
 * Rows are clickable and update the selected item via context.actions.selectItem().
 *
 * ===========================================================================================
 */

export interface RowClickViewDataTableProps<T = Product> {
	columns: ColumnDef<T>[];
	features: DataTableFeature[];
}

export function RowClickViewDataTable<T extends Product = Product>({
	columns,
	features,
}: RowClickViewDataTableProps<T>) {
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

	/**
	 * Handle row click to select item
	 */
	const handleRowClick = (item: T) => {
		void context.actions.selectItem(item.id);
	};

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
				onRowClick={handleRowClick}
				getRowClassName={() => 'cursor-pointer hover:bg-accent/20'}
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
