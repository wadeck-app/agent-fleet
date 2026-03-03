import type { ComponentType, ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import type { TableColumn } from '@framework/components/table/Table';
import { Table } from '@framework/components/table/Table';
import type { ColumnDef } from '@framework/lego';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';

import { DataTableContext } from './DataTableContext';
import { useDataTable } from './DataTableContext';
import { useTableDataFetch } from './useTableDataFetch';

/**
 * ===========================================================================================
 * DATA TABLE - Compound Component Pattern
 * ===========================================================================================
 *
 * Approach 4: DataTable creates context, sub-components consume automatically.
 * Zero explicit wiring, pure composition.
 *
 * Pattern:
 * ```tsx
 * <DataTable service={productsService} columns={columns}>
 *   <DataTable.Toolbar>
 *     <DataTable.Search />
 *     <DataTable.ColumnVisibility />
 *     <DataTable.CreateButton dialog={ProductDialog} />
 *   </DataTable.Toolbar>
 *   <DataTable.BulkBar />
 *   <DataTable.Body />
 *   <DataTable.Footer>
 *     <DataTable.Pagination defaultSize={10} />
 *   </DataTable.Footer>
 *   <DataTable.Dialog dialog={ProductDialog} />
 * </DataTable>
 * ```
 *
 * ===========================================================================================
 */

export interface DataTableRootProps<T extends { id: string }> {
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
	children: ReactNode;
	defaultPageSize?: number;
}

// Root component — creates context, fetches data
function DataTableRoot<T extends { id: string }>({
	service,
	columns,
	children,
	defaultPageSize = 10,
}: DataTableRootProps<T>) {
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(defaultPageSize);
	const [sortBy, setSortBy] = useState<string | undefined>();
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
	const [selectedIds, setSelectedIds] = useState(new Set<string>());
	const [visibleColumns, setVisibleColumns] = useState(new Set(columns.map(c => c.key as string)));
	const [editingItem, setEditingItem] = useState<T | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	const setSort = useCallback((key?: string, order?: 'asc' | 'desc') => {
		setSortBy(key);
		setSortOrder(order);
	}, []);

	const query = { search, page, pageSize, sortBy, sortOrder };
	const { items, loading, pagination, refresh } = useTableDataFetch({
		fetchFn: async q => {
			const params: {
				search?: string;
				page?: number;
				pageSize?: number;
				sortBy?: string;
				sortOrder?: string;
			} = {};
			if (q.search) params.search = q.search;
			params.page = q.page;
			params.pageSize = q.pageSize;
			if (q.sortBy) {
				params.sortBy = q.sortBy;
				params.sortOrder = q.sortOrder || 'asc';
			}
			return await service.getProducts(params);
		},
		query,
	});

	return (
		<DataTableContext.Provider
			value={{
				items,
				loading,
				pagination,
				refresh,
				search,
				setSearch,
				page,
				pageSize,
				setPage,
				setPageSize,
				sortBy,
				sortOrder,
				setSort,
				selectedIds,
				setSelectedIds,
				visibleColumns,
				setVisibleColumns,
				editingItem,
				setEditingItem,
				dialogOpen,
				setDialogOpen,
				service,
				columns,
			}}
		>
			{children}
		</DataTableContext.Provider>
	);
}

// Toolbar container
DataTableRoot.Toolbar = function Toolbar({ children }: { children: ReactNode }) {
	return <div className="flex items-center gap-2">{children}</div>;
};

// Search input
DataTableRoot.Search = function Search({ placeholder = 'Search...' }: { placeholder?: string }) {
	const ctx = useDataTable();
	return <SearchInput value={ctx.search} onChange={ctx.setSearch} placeholder={placeholder} className="flex-1" />;
};

// Column visibility toggle
DataTableRoot.ColumnVisibility = function ColVis() {
	const ctx = useDataTable();

	return (
		<ColumnVisibility
			columns={ctx.columns.map(c => ({ id: c.key as string, label: c.label }))}
			visibleColumns={ctx.visibleColumns}
			onToggle={id => {
				const newSet = new Set(ctx.visibleColumns);
				if (newSet.has(id)) {
					newSet.delete(id);
				} else {
					newSet.add(id);
				}
				ctx.setVisibleColumns(newSet);
			}}
			onReset={() => ctx.setVisibleColumns(new Set(ctx.columns.map(c => c.key as string)))}
			onShowAll={() => ctx.setVisibleColumns(new Set(ctx.columns.map(c => c.key as string)))}
			onHideAll={() => ctx.setVisibleColumns(new Set())}
		/>
	);
};

// Create button
DataTableRoot.CreateButton = function CreateButton({ dialog: _Dialog }: { dialog: ComponentType<any> }) {
	const ctx = useDataTable();
	return (
		<Button
			onClick={() => {
				ctx.setEditingItem(null);
				ctx.setDialogOpen(true);
			}}
		>
			<Plus className="size-4" />
			Add
		</Button>
	);
};

// Bulk action bar
DataTableRoot.BulkBar = function BulkBar() {
	const ctx = useDataTable();
	if (ctx.selectedIds.size === 0) return null;

	const handleBulkDelete = async () => {
		if (!ctx.service.bulkDeleteProducts) return;
		if (confirm(`Delete ${ctx.selectedIds.size} items?`)) {
			await ctx.service.bulkDeleteProducts(Array.from(ctx.selectedIds));
			ctx.setSelectedIds(new Set());
			ctx.refresh();
		}
	};

	return (
		<BulkActionBar
			selectionCount={ctx.selectedIds.size}
			selectedLabel={`${ctx.selectedIds.size} selected`}
			onCancel={() => ctx.setSelectedIds(new Set())}
		>
			<Button onClick={handleBulkDelete} variant="destructive" size="sm">
				<Trash2 className="size-4" />
				Delete
			</Button>
		</BulkActionBar>
	);
};

// Table body
DataTableRoot.Body = function Body() {
	const ctx = useDataTable();
	const [sortConfigs, setSortConfigs] = useState<Array<{ key: string; direction: 'asc' | 'desc' }>>([]);

	const handleSortChange = useCallback(
		(key: string, shiftKey: boolean) => {
			setSortConfigs(prev => {
				// Find if this key is already sorted
				const existingIndex = prev.findIndex(c => c.key === key);

				if (existingIndex >= 0) {
					// Toggle existing sort: asc -> desc -> remove
					const existing = prev[existingIndex];
					if (!existing) return prev;

					if (existing.direction === 'asc') {
						// Change to desc
						const newConfigs = [...prev];
						newConfigs[existingIndex] = { key, direction: 'desc' };
						// Update context
						ctx.setSort(key, 'desc');
						return newConfigs;
					} else {
						// Remove this sort
						const newConfigs = prev.filter((_, i) => i !== existingIndex);
						if (newConfigs.length === 0) {
							ctx.setSort(undefined, undefined);
						} else {
							const first = newConfigs[0];
							if (first) ctx.setSort(first.key, first.direction);
						}
						return newConfigs;
					}
				} else {
					// Add new sort (asc by default)
					const newConfigs = shiftKey
						? [...prev, { key, direction: 'asc' as const }]
						: [{ key, direction: 'asc' as const }];
					ctx.setSort(key, 'asc');
					return newConfigs;
				}
			});
		},
		[ctx]
	);

	// Filter visible columns
	const visibleColumnDefs = ctx.columns.filter(col => ctx.visibleColumns.has(col.key as string));

	// Build TableColumn[] from ColumnDef[]
	const tableColumns: TableColumn<any>[] = visibleColumnDefs.map(col => {
		const renderCell = (item: any) => {
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

		return {
			key: col.key as string,
			label: col.label,
			render: (item: any) => renderCell(item),
			sortable: col.sortable,
		};
	});

	const handleEdit = (item: any) => {
		ctx.setEditingItem(item);
		ctx.setDialogOpen(true);
	};

	const handleDelete = async (id: string) => {
		if (!ctx.service.deleteProduct) return;
		if (confirm('Delete this item?')) {
			await ctx.service.deleteProduct(id);
			ctx.refresh();
		}
	};

	const renderActions = (item: any) => {
		return (
			<div className="flex gap-1">
				{ctx.service.updateProduct && (
					<Button onClick={() => handleEdit(item)} size="sm" variant="ghost">
						<Edit className="size-3" />
					</Button>
				)}
				{ctx.service.deleteProduct && (
					<Button onClick={() => handleDelete(item.id)} size="sm" variant="ghost">
						<Trash2 className="size-3" />
					</Button>
				)}
			</div>
		);
	};

	const hasActions = ctx.service.updateProduct || ctx.service.deleteProduct;

	return (
		<Table
			data={ctx.items}
			columns={tableColumns}
			getItemId={(item: any) => item.id}
			selectable={Boolean(hasActions)}
			selectedIds={ctx.selectedIds}
			onSelectionChange={ctx.setSelectedIds}
			renderActions={hasActions ? renderActions : undefined}
			loading={ctx.loading}
			emptyMessage="No items found"
			sorting={{ sortConfigs, onSortChange: handleSortChange }}
		/>
	);
};

// Footer container
DataTableRoot.Footer = function Footer({ children }: { children: ReactNode }) {
	return <div className="flex items-center justify-between">{children}</div>;
};

// Pagination controls
DataTableRoot.Pagination = function PaginationControls({
	defaultSize: _defaultSize = 10,
	pageSizes = [10, 20, 50],
}: {
	defaultSize?: number;
	pageSizes?: number[];
}) {
	const ctx = useDataTable();
	return (
		<>
			<div className="text-sm text-muted-foreground">
				Showing {(ctx.pagination.page - 1) * ctx.pagination.pageSize + 1} to{' '}
				{Math.min(ctx.pagination.page * ctx.pagination.pageSize, ctx.pagination.total)} of{' '}
				{ctx.pagination.total} items
			</div>
			<div className="flex items-center gap-4">
				<PageSizeSelector value={ctx.pageSize} onChange={ctx.setPageSize} options={pageSizes} />
				<div className="text-sm text-muted-foreground">
					Page {ctx.pagination.page} of {ctx.pagination.totalPages}
				</div>
				<Pagination
					currentPage={ctx.pagination.page}
					totalPages={ctx.pagination.totalPages}
					onPageChange={ctx.setPage}
				/>
			</div>
		</>
	);
};

// Dialog renderer
DataTableRoot.Dialog = function DialogRenderer({ dialog: Dialog }: { dialog: ComponentType<any> }) {
	const ctx = useDataTable();
	if (!ctx.dialogOpen || !Dialog) return null;

	const handleSave = async (data: unknown) => {
		if (ctx.editingItem) {
			await ctx.service.updateProduct?.((ctx.editingItem as { id: string }).id, data);
		} else {
			await ctx.service.createProduct?.(data);
		}
		ctx.setDialogOpen(false);
		ctx.refresh();
	};

	return <Dialog item={ctx.editingItem} onSave={handleSave} onClose={() => ctx.setDialogOpen(false)} />;
};

export const DataTable = DataTableRoot;
