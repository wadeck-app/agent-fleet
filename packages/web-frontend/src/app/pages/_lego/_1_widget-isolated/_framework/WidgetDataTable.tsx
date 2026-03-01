import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Badge } from '@framework/components/primitives/Badge';
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
import { resolveFeature } from '@framework/lego';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';

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
	onRefreshRef?: MutableRefObject<(() => void) | undefined>;
}

export function WidgetDataTable<T extends { id: string }>({
	service,
	columns,
	features,
	onRefreshRef,
}: WidgetDataTableProps<T>) {
	const { query, setSearch, setPage, setPageSize, setSort } = useWidgetQuery(features);

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

	// Build TableColumn array from ColumnDef array using renderCellValue logic
	const tableColumns: TableColumn<T>[] = useMemo(() => {
		const renderCellValue = (item: T, col: ColumnDef<T>): ReactNode => {
			if (col.render) return col.render(item);

			const value = item[col.key];

			if (col.type === 'boolean') {
				return value ? (
					<Check className="size-4 text-primary" />
				) : (
					<X className="size-4 text-muted-foreground" />
				);
			}

			if (col.type === 'number' && typeof value === 'number') {
				return (
					<span>
						{col.prefix}
						{value.toFixed(2)}
						{col.suffix}
					</span>
				);
			}

			if (col.type === 'enum' && col.badge) {
				return <Badge variant="secondary">{String(value)}</Badge>;
			}

			if (col.type === 'date') {
				if (value instanceof Date) {
					return value.toLocaleDateString();
				}
				if (typeof value === 'string') {
					return new Date(value).toLocaleDateString();
				}
			}

			return String(value || '');
		};

		return columns.map(col => ({
			key: col.key as string,
			label: col.label,
			sortable: col.sortable,
			render: (item: T, _isEditing: boolean) => renderCellValue(item, col),
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
		if (!service.deleteProduct) return;
		if (confirm('Delete this item?')) {
			await service.deleteProduct(id);
			refresh();
		}
	};

	const handleBulkDelete = async () => {
		if (!service.bulkDeleteProducts) return;
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
			/>

			{dialogOpen && crudConfig && crudConfig.dialog && (
				<crudConfig.dialog item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</div>
	);
}
