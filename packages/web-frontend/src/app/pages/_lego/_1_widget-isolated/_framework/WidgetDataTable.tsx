import { type MutableRefObject, useCallback, useEffect, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
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
import { ArrowDown, ArrowUp, Check, Edit, Plus, Trash2, X } from 'lucide-react';

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

	const visibleColumnDefs = columns.filter(c => visibleColumns.has(c.key as string));

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

	const renderCellValue = (item: T, col: ColumnDef<T>) => {
		if (col.render) return col.render(item);

		const value = item[col.key];

		if (col.type === 'boolean') {
			return value ? <Check className="size-4 text-primary" /> : <X className="size-4 text-muted-foreground" />;
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

	const toggleSelectAll = () => {
		if (selectedIds.size === items.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(items.map(i => i.id)));
		}
	};

	const toggleSelect = (id: string) => {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		setSelectedIds(newSet);
	};

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

			<div className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
				<div className="h-full overflow-auto">
					<table className="w-full">
						<thead className="sticky top-0 bg-muted">
							<tr>
								{(bulkDeleteConfig || crudConfig) && (
									<th className="w-12 p-2">
										<Checkbox
											checked={selectedIds.size === items.length && items.length > 0}
											onCheckedChange={toggleSelectAll}
										/>
									</th>
								)}
								{visibleColumnDefs.map(col => (
									<th key={col.key as string} className="p-2 text-left">
										{col.sortable && sortingConfig ? (
											<Button
												variant="ghost"
												onClick={() => handleSort(col.key as string)}
												className="flex items-center gap-1 font-semibold"
											>
												{col.label}
												{sortState?.key === col.key &&
													(sortState.order === 'asc' ? (
														<ArrowUp className="size-3" />
													) : (
														<ArrowDown className="size-3" />
													))}
											</Button>
										) : (
											<span className="font-semibold">{col.label}</span>
										)}
									</th>
								))}
								{crudConfig && <th className="w-24 p-2">Actions</th>}
							</tr>
						</thead>
						<tbody>
							{loading && (
								<tr>
									<td colSpan={visibleColumnDefs.length + 2} className="p-8 text-center">
										Loading...
									</td>
								</tr>
							)}
							{!loading && items.length === 0 && (
								<tr>
									<td colSpan={visibleColumnDefs.length + 2} className="p-8 text-center">
										No items found
									</td>
								</tr>
							)}
							{!loading &&
								items.map(item => (
									<tr key={item.id} className="border-t border-border hover:bg-muted/50">
										{(bulkDeleteConfig || crudConfig) && (
											<td className="p-2">
												<Checkbox
													checked={selectedIds.has(item.id)}
													onCheckedChange={() => toggleSelect(item.id)}
												/>
											</td>
										)}
										{visibleColumnDefs.map(col => (
											<td key={col.key as string} className="p-2">
												{renderCellValue(item, col)}
											</td>
										))}
										{crudConfig && (
											<td className="p-2">
												<div className="flex gap-1">
													<Button onClick={() => handleEdit(item)} size="sm" variant="ghost">
														<Edit className="size-3" />
													</Button>
													<Button
														onClick={() => handleDelete(item.id)}
														size="sm"
														variant="ghost"
													>
														<Trash2 className="size-3" />
													</Button>
												</div>
											</td>
										)}
									</tr>
								))}
						</tbody>
					</table>
				</div>
			</div>

			{paginationConfig && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {items.length} of {pagination.total} items
					</div>
					<div className="flex items-center gap-4">
						<PageSizeSelector
							value={query.pageSize}
							onChange={setPageSize}
							options={paginationConfig.pageSizes || [10, 20, 50]}
						/>
						<Pagination
							currentPage={pagination.page}
							totalPages={pagination.totalPages}
							onPageChange={setPage}
						/>
					</div>
				</div>
			)}

			{dialogOpen && crudConfig && crudConfig.dialog && (
				<crudConfig.dialog item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</div>
	);
}
