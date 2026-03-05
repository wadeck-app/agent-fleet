import { type RefObject, useEffect, useMemo, useState } from 'react';

import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import type { ColumnDef } from '@framework/lego';
import { renderColumnValue } from '@framework/lego';
import { Edit, Plus, Trash2 } from 'lucide-react';

import { useWidgetDataFetch } from '@app/pages/_lego/_1_widget-isolated/_framework/useWidgetDataFetch';

import type { BulkDeleteFeatureHook } from './useBulkDeleteFeature';
import type { ColumnVisibilityFeatureHook } from './useColumnVisibilityFeature';
import type { CrudFeatureHook } from './useCrudFeature';
import type { PaginationFeatureHook } from './usePaginationFeature';
import type { SearchFeatureHook } from './useSearchFeature';
import type { SortingFeatureHook } from './useSortingFeature';

/**
 * ===========================================================================================
 * HOOK DATA TABLE - Hook-Based Data Table Widget
 * ===========================================================================================
 *
 * Data table widget that accepts feature hooks from the page.
 * Features are React hooks created in the page and passed as initialized instances.
 *
 * Architecture:
 * - Page owns hooks (typed feature instances)
 * - Widget accepts hook return values and uses them as operational state
 * - No internal state management for features
 *
 * Contrast:
 * - A1: Widget owns state (internal hooks)
 * - A2: Context owns state (shared via provider)
 * - A3: Page owns hooks (passed as props) ← This approach
 *
 * ===========================================================================================
 * DESIGN NOTES - Approach A3 Trade-offs
 * ===========================================================================================
 *
 * A3.c - Display Feature Rigidity (Same as A1.h):
 * Display features (columns, grid layout, card view) are hard-coded in HookXxx components.
 * Adding a new display variant requires modifying HookDataTable or creating a new HookXxx
 * component. There is no composition point for display variants - the widget is a closed
 * system for rendering strategies.
 *
 * ===========================================================================================
 */

export type DataTableFeatureHook =
	| SearchFeatureHook
	| PaginationFeatureHook
	| SortingFeatureHook
	| ColumnVisibilityFeatureHook
	| BulkDeleteFeatureHook
	| CrudFeatureHook;

export interface HookDataTableProps<T> {
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
	features: DataTableFeatureHook[];
	onRefreshRef?: RefObject<(() => void) | undefined>;
	onRowSelect?: (id: string) => void;
	onItemsLoaded?: (items: T[]) => void;
}

export function HookDataTable<T extends { id: string }>({
	service,
	columns,
	features,
	onRefreshRef,
	onRowSelect,
	onItemsLoaded,
}: HookDataTableProps<T>) {
	// Extract feature hooks by type
	const searchFeature = features.find(f => f.type === 'search') as SearchFeatureHook | undefined;
	const paginationFeature = features.find(f => f.type === 'pagination') as PaginationFeatureHook | undefined;
	const sortingFeature = features.find(f => f.type === 'sorting') as SortingFeatureHook | undefined;
	const columnVisibilityFeature = features.find(f => f.type === 'column-visibility') as
		| ColumnVisibilityFeatureHook
		| undefined;
	const bulkDeleteFeature = features.find(f => f.type === 'bulk-delete') as BulkDeleteFeatureHook | undefined;
	const crudFeature = features.find(f => f.type === 'crud') as CrudFeatureHook | undefined;

	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(columns.map(c => c.key as string)));

	// Convert ColumnDef to TableColumn
	const tableColumns: TableColumn<T>[] = useMemo(
		() =>
			columns.map(col => ({
				key: col.key as string,
				label: col.label,
				sortable: col.sortable,
				render: (item: T) => renderColumnValue(col, item),
			})),
		[columns]
	);

	const filteredColumns = useMemo(
		() => tableColumns.filter(col => visibleColumns.has(col.key as string)),
		[tableColumns, visibleColumns]
	);

	// Build query from feature hooks
	const query = useMemo(
		() => ({
			search: searchFeature?.value ?? '',
			page: paginationFeature?.page ?? 1,
			pageSize: paginationFeature?.pageSize ?? 10,
			sortBy: sortingFeature?.sortBy,
			sortOrder: sortingFeature?.sortOrder,
		}),
		[
			searchFeature?.value,
			paginationFeature?.page,
			paginationFeature?.pageSize,
			sortingFeature?.sortBy,
			sortingFeature?.sortOrder,
		]
	);

	// Use the same data fetching hook from approach 1
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
			if (paginationFeature) {
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
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<T | null>(null);

	useEffect(() => {
		if (onRefreshRef) {
			onRefreshRef.current = refresh;
		}
	}, [refresh, onRefreshRef]);

	useEffect(() => {
		if (onItemsLoaded) {
			onItemsLoaded(items);
		}
	}, [items, onItemsLoaded]);

	// CRUD handlers
	const handleCreate = () => {
		setEditingItem(null);
		setDialogOpen(true);
	};

	const handleEdit = (item: T) => {
		setEditingItem(item);
		setDialogOpen(true);
	};

	const handleDelete = async (item: T) => {
		if (!service.deleteProduct) {
			return;
		}
		if (confirm('Are you sure you want to delete this item?')) {
			await service.deleteProduct(item.id);
			refresh();
		}
	};

	const handleBulkDelete = async () => {
		if (!service.bulkDeleteProducts) {
			return;
		}
		if (confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) {
			await service.bulkDeleteProducts(Array.from(selectedIds));
			setSelectedIds(new Set());
			refresh();
		}
	};

	const handleDialogSave = async (data: unknown) => {
		if (editingItem) {
			await service.updateProduct?.(editingItem.id, data);
		} else {
			await service.createProduct?.(data);
		}
		setDialogOpen(false);
		setEditingItem(null);
		refresh();
	};

	// Sorting handler
	const handleSortChange = (key: string) => {
		if (!sortingFeature) {
			return;
		}

		const currentSort = sortingFeature.sortBy === key ? sortingFeature.sortOrder : null;
		const nextOrder: 'asc' | 'desc' = currentSort === 'asc' ? 'desc' : 'asc';

		sortingFeature.setSort(key, nextOrder);
	};

	// Render actions dropdown
	const renderActions = (item: T) => (
		<div className="flex gap-1">
			<Button onClick={() => handleEdit(item)} size="sm" variant="ghost">
				<Edit className="size-3" />
			</Button>
			<Button onClick={() => handleDelete(item)} size="sm" variant="ghost">
				<Trash2 className="size-3" />
			</Button>
		</div>
	);

	return (
		<div className="flex h-full flex-col gap-4">
			{/* Toolbar */}
			{(searchFeature || columnVisibilityFeature || crudFeature) && (
				<div className="flex items-center gap-2">
					{searchFeature && (
						<SearchInput
							value={searchFeature.value}
							onChange={searchFeature.onChange}
							onClear={() => searchFeature.onChange('')}
							placeholder={searchFeature.placeholder || 'Search...'}
							className="flex-1"
						/>
					)}
					{columnVisibilityFeature && (
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
					{crudFeature && (
						<Button onClick={handleCreate}>
							<Plus className="size-4" />
							Add
						</Button>
					)}
				</div>
			)}

			{/* Bulk delete bar */}
			{bulkDeleteFeature && selectedIds.size > 0 && (
				<div className="flex items-center justify-between rounded-md bg-muted p-4">
					<span className="text-sm">{selectedIds.size} items selected</span>
					<Button variant="destructive" size="sm" onClick={handleBulkDelete}>
						<Trash2 className="mr-2 size-4" />
						Delete Selected
					</Button>
				</div>
			)}

			{/* Table component */}
			<Table
				data={items}
				columns={filteredColumns}
				getItemId={item => item.id}
				selectable={!!bulkDeleteFeature}
				selectedIds={selectedIds}
				onSelectionChange={setSelectedIds}
				renderActions={crudFeature ? renderActions : undefined}
				loading={loading}
				emptyMessage="No items found"
				pagination={
					paginationFeature
						? {
								currentPage: pagination.page,
								totalPages: pagination.totalPages,
								totalItems: pagination.total,
								onPageChange: paginationFeature.setPage,
								pageSize: paginationFeature.pageSize,
								onPageSizeChange: paginationFeature.setPageSize,
								pageSizeOptions: paginationFeature.pageSizes || [10, 20, 50],
							}
						: undefined
				}
				sorting={
					sortingFeature
						? {
								sortConfigs: sortingFeature.sortBy
									? [{ key: sortingFeature.sortBy, direction: sortingFeature.sortOrder || 'asc' }]
									: [],
								onSortChange: handleSortChange,
							}
						: undefined
				}
				columnVisibility={false}
				getRowClassName={onRowSelect ? () => 'cursor-pointer hover:bg-accent/20' : undefined}
			/>

			{/* CRUD Dialog */}
			{crudFeature && dialogOpen && (
				<crudFeature.dialog
					item={editingItem}
					onSave={handleDialogSave}
					onClose={() => {
						setDialogOpen(false);
						setEditingItem(null);
					}}
				/>
			)}
		</div>
	);
}
