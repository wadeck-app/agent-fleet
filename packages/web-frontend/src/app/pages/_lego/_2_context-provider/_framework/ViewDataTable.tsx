import { useMemo, useState } from 'react';

import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import { Table } from '@framework/components/table/Table';
import type { TableColumn } from '@framework/components/table/Table';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { DataTableFeature } from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';

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
 */

export interface ViewDataTableProps<T = Product> {
	columns: ColumnDef<T>[];
	features: DataTableFeature[];
	enableRowClick?: boolean;
}

export function ViewDataTable<T extends Product = Product>({
	columns,
	features,
	enableRowClick = false,
}: ViewDataTableProps<T>) {
	const context = useProductDomain();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<T | null>(null);
	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(columns.map(c => c.key as string)));

	/**
	 * Resolve features
	 */
	const searchConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'search');
				return resolved !== null;
			}),
		[features]
	);

	const paginationConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'pagination');
				return resolved !== null;
			}),
		[features]
	);

	const sortingConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'sorting');
				return resolved !== null;
			}),
		[features]
	);

	const columnVisibilityConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'column-visibility');
				return resolved !== null;
			}),
		[features]
	);

	const bulkDeleteConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'bulk-delete');
				return resolved !== null;
			}),
		[features]
	);

	const crudConfig = useMemo(() => {
		const found = features.find(f => typeof f === 'object' && f.type === 'crud');
		return found && typeof found === 'object' && found.type === 'crud' ? found : null;
	}, [features]);

	/**
	 * Convert ColumnDef to TableColumn
	 */
	const tableColumns: TableColumn<T>[] = useMemo(
		() =>
			columns.map(col => ({
				key: col.key,
				label: col.label,
				sortable: col.sortable,
				render: (item: T) => {
					if (col.render) {
						return col.render(item);
					}

					const value = item[col.key];

					if (col.type === 'text') {
						return <span>{String(value ?? '')}</span>;
					}

					if (col.type === 'number') {
						const prefix = col.prefix ?? '';
						const suffix = col.suffix ?? '';
						return (
							<span>
								{prefix}
								{typeof value === 'number' ? value.toFixed(2) : String(value)}
								{suffix}
							</span>
						);
					}

					if (col.type === 'enum' && col.badge) {
						return <Badge variant="secondary">{String(value)}</Badge>;
					}

					if (col.type === 'enum') {
						return <span>{String(value)}</span>;
					}

					if (col.type === 'boolean') {
						return value ? (
							<Check className="size-4 text-primary" />
						) : (
							<X className="size-4 text-muted-foreground" />
						);
					}

					if (col.type === 'date') {
						return (
							<span>{value ? new Date(value as string | number | Date).toLocaleDateString() : '–'}</span>
						);
					}

					return <span>{String(value ?? '')}</span>;
				},
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

	const handleDelete = async (item: T) => {
		if (confirm('Are you sure you want to delete this item?')) {
			await context.actions.delete(item.id);
		}
	};

	const handleBulkDelete = async () => {
		if (confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) {
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
		<div className="space-y-4">
			{searchConfig && (
				<div className="flex items-center gap-2">
					<SearchInput
						value={context.query.search}
						onChange={value => context.actions.setQuery({ search: value })}
						onClear={() => context.actions.setQuery({ search: '' })}
						placeholder="Search products..."
						className="flex-1"
					/>
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
				<div className="flex items-center justify-between rounded-md bg-muted p-4">
					<span className="text-sm">{selectedIds.size} items selected</span>
					<Button variant="destructive" size="sm" onClick={handleBulkDelete}>
						<Trash2 className="mr-2 size-4" />
						Delete Selected
					</Button>
				</div>
			)}

			<Table
				data={context.items as T[]}
				columns={filteredColumns}
				getItemId={item => item.id}
				selectable={!!bulkDeleteConfig}
				selectedIds={selectedIds}
				onSelectionChange={setSelectedIds}
				renderActions={crudConfig ? renderActions : undefined}
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
								pageSizeOptions: [5, 10, 20, 50],
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
				columnVisibility={false}
				getRowClassName={
					enableRowClick
						? item =>
								context.selectedItem?.id === item.id
									? 'cursor-pointer bg-accent/50'
									: 'cursor-pointer hover:bg-accent/20'
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
