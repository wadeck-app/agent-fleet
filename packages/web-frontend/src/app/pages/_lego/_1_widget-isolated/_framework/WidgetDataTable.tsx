import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table, type TableColumn } from '@framework/components/table/Table';
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
import { Edit, Plus, Trash2 } from 'lucide-react';

import { useGlobalPageEventsOptional } from './GlobalEventContext';
import { useWidgetDataFetch } from './useWidgetDataFetch';
import { useWidgetQuery } from './useWidgetQuery';

/**
 * ===========================================================================================
 * WIDGET DATA TABLE - Complete Data Table Widget
 * ===========================================================================================
 *
 * Self-contained data table widget with internal query state.
 * Supports search, pagination, sorting, column visibility, bulk delete, and CRUD operations.
 *
 * Features:
 * - Internal state management (search, pagination, sorting)
 * - Event bus integration (emits/listens)
 * - Feature-driven UI composition
 * - Zero CSS at page level
 *
 * ===========================================================================================
 * DESIGN NOTES - Approach A1 Trade-offs
 * ===========================================================================================
 *
 * A1.b - Immutable Lego Brick Strategy:
 * This widget is a self-contained unit with a fixed feature set. Features are pre-determined
 * and configured via the `features` prop array. Extension happens through:
 * - Slots (e.g., renderActions, onRowClick callbacks)
 * - Event bus (emits/listens for cross-widget communication)
 * The widget itself is immutable - you cannot compose new features into it at runtime.
 *
 * A1.h - Display Feature Rigidity:
 * Adding a new display feature (e.g., new column type, card layout, grid view) requires
 * modifying ALL WidgetXxx components (WidgetDataTable, WidgetDetailPanel, WidgetItemGrid, etc.).
 * There is no composition point for new display variants. The widget is a closed system.
 *
 * ===========================================================================================
 */

export interface WidgetDataTableProps<T> {
	service: {
		getProducts: (query: {
			search?: string;
			page?: number;
			pageSize?: number;
			sortBy?: string;
			sortOrder?: string;
		}) => Promise<{
			items: T[];
			total?: number;
			page?: number;
			pageSize?: number;
			pagination?: { total: number; page: number; pageSize: number; totalPages: number };
		}>;
		createProduct?: (data: any) => Promise<any>;
		updateProduct?: (id: string, data: any) => Promise<any>;
		deleteProduct?: (id: string) => Promise<void>;
		bulkDeleteProducts?: (ids: string[]) => Promise<unknown>;
	};
	columns: ColumnDef<T>[];
	features: DataTableFeature[];
	emits?: string[];
	listens?: string[];
	onRefreshRef?: RefObject<(() => void) | undefined>;
}

export function WidgetDataTable<T extends { id: string }>({
	service,
	columns,
	features,
	onRefreshRef,
}: WidgetDataTableProps<T>) {
	const eventBus = useGlobalPageEventsOptional();

	const { query, setSearch, setPage, setPageSize, setSort } = useWidgetQuery(features);

	const featureConfigs = useMemo(() => {
		return {
			search: features.map(f => resolveFeature<SearchConfig>(f as string | SearchConfig, 'search')).find(Boolean),
			pagination: features
				.map(f => resolveFeature<PaginationConfig>(f as string | PaginationConfig, 'pagination'))
				.find(Boolean),
			sorting: features
				.map(f => resolveFeature<SortingConfig>(f as string | SortingConfig, 'sorting'))
				.find(Boolean),
			columnVisibility: features
				.map(f =>
					resolveFeature<ColumnVisibilityConfig>(f as string | ColumnVisibilityConfig, 'column-visibility')
				)
				.find(Boolean),
			bulkDelete: features
				.map(f => resolveFeature<BulkDeleteConfig>(f as string | BulkDeleteConfig, 'bulk-delete'))
				.find(Boolean),
			crud: features.map(f => resolveFeature<CrudConfig>(f as string | CrudConfig, 'crud')).find(Boolean),
		};
	}, [features]);

	const searchConfig = featureConfigs.search;
	const paginationConfig = featureConfigs.pagination;
	const sortingConfig = featureConfigs.sorting;
	const columnVisibilityConfig = featureConfigs.columnVisibility;
	const bulkDeleteConfig = featureConfigs.bulkDelete;
	const crudConfig = featureConfigs.crud;

	const { items, loading, pagination, refresh } = useWidgetDataFetch({
		fetchFn: async q => {
			const params: {
				search?: string;
				page?: number;
				pageSize?: number;
				sortBy?: string;
				sortOrder?: string;
			} = {};
			if (q.search) params.search = q.search;
			if (paginationConfig) {
				params.page = q.page;
				params.pageSize = q.pageSize;
			}
			if (q.sortBy) {
				params.sortBy = q.sortBy;
				params.sortOrder = q.sortOrder || 'asc';
			}
			return await service.getProducts(params);
		},
		query,
	});

	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(columns.map(c => c.key as string)));
	const [sortState, setSortState] = useState<{ key: string; order: 'asc' | 'desc' } | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<T | null>(null);

	useEffect(() => {
		if (onRefreshRef) {
			onRefreshRef.current = refresh;
		}
	}, [refresh, onRefreshRef]);

	// Build TableColumn array from ColumnDef array
	const tableColumns: TableColumn<T>[] = useMemo(() => {
		return columns.map(col => ({
			key: col.key as string,
			label: col.label,
			sortable: col.sortable,
			render: (item: T, _isEditing: boolean) => renderColumnValue(col, item),
		}));
	}, [columns]);

	// Filter visible columns for Table
	const visibleTableColumns = tableColumns.filter(col => visibleColumns.has(col.key));

	const handleSort = useCallback(
		(key: string) => {
			const currentSort = sortState?.key === key ? sortState.order : null;
			const nextOrder = currentSort === 'asc' ? 'desc' : currentSort === 'desc' ? null : 'asc';

			if (nextOrder) {
				setSortState({ key, order: nextOrder });
				setSort(key, nextOrder);
			} else {
				setSortState(null);
				setSort(undefined, undefined);
			}
		},
		[sortState, setSort]
	);

	const handleCreate = () => {
		setEditingItem(null);
		setDialogOpen(true);
	};

	const handleEdit = (item: T) => {
		setEditingItem(item);
		setDialogOpen(true);
	};

	const handleDelete = async (id: string) => {
		if (!service.deleteProduct) {
			return;
		}
		if (confirm('Delete this item?')) {
			await service.deleteProduct(id);
			refresh();
		}
	};

	const handleBulkDelete = async () => {
		if (!service.bulkDeleteProducts) {
			return;
		}
		if (confirm(`Delete ${selectedIds.size} items?`)) {
			await service.bulkDeleteProducts(Array.from(selectedIds));
			setSelectedIds(new Set());
			refresh();
		}
	};

	// Build renderActions function for CRUD buttons
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

	const handleDialogClose = () => {
		setDialogOpen(false);
		setEditingItem(null);
	};

	const handleDialogSave = async (data: unknown) => {
		if (editingItem) {
			await service.updateProduct?.(editingItem.id, data);
		} else {
			await service.createProduct?.(data);
		}
		handleDialogClose();
		refresh();
	};

	return (
		<div className="flex h-full flex-col gap-4">
			{(searchConfig || columnVisibilityConfig || crudConfig) && (
				<div className="flex items-center gap-2">
					{searchConfig && (
						<SearchInput
							value={query.search}
							onChange={setSearch}
							placeholder={searchConfig.placeholder || 'Search...'}
							className="flex-1"
						/>
					)}
					{columnVisibilityConfig && (
						<ColumnVisibility
							columns={columns.map(c => ({ id: c.key as string, label: c.label }))}
							visibleColumns={visibleColumns}
							onToggle={id => {
								const newSet = new Set(visibleColumns);
								if (newSet.has(id)) {
									newSet.delete(id);
								} else {
									newSet.add(id);
								}
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
				data={items}
				columns={visibleTableColumns}
				getItemId={item => item.id}
				selectable={!!(bulkDeleteConfig || crudConfig)}
				selectedIds={selectedIds}
				onSelectionChange={setSelectedIds}
				renderActions={renderActions}
				loading={loading}
				emptyMessage="No items found"
				pagination={
					paginationConfig
						? {
								currentPage: pagination.page,
								totalPages: pagination.totalPages,
								totalItems: pagination.total,
								onPageChange: setPage,
								pageSize: query.pageSize,
								onPageSizeChange: setPageSize,
								pageSizeOptions: paginationConfig.pageSizes || [10, 20, 50],
							}
						: undefined
				}
				sorting={
					sortingConfig
						? {
								sortConfigs: sortState ? [{ key: sortState.key, direction: sortState.order }] : [],
								onSortChange: handleSort,
							}
						: undefined
				}
				onRowClick={
					eventBus
						? item => {
								eventBus.emit('product:selected', { id: item.id, items });
							}
						: undefined
				}
				getRowClassName={eventBus ? () => 'cursor-pointer hover:bg-accent/20' : undefined}
			/>

			{dialogOpen && crudConfig && crudConfig.dialog && (
				<crudConfig.dialog item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</div>
	);
}
