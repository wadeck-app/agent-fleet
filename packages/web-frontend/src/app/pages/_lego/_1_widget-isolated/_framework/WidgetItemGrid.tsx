import { useState } from 'react';

import { Checkbox } from '@framework/components/forms/Checkbox';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import type {
	BulkDeleteConfig,
	ColumnDef,
	CrudConfig,
	ItemGridFeature,
	PaginationConfig,
	SearchConfig,
} from '@framework/lego';
import { resolveFeature } from '@framework/lego';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';

import { useWidgetDataFetch } from './useWidgetDataFetch';
import { useWidgetQuery } from './useWidgetQuery';

/**
 * ===========================================================================================
 * WIDGET ITEM GRID - Grid of Cards Widget
 * ===========================================================================================
 *
 * Displays items in a responsive grid layout (2-4 columns).
 * Supports search, pagination, CRUD, and bulk delete.
 *
 * ===========================================================================================
 */

export interface WidgetItemGridProps<T> {
	service: {
		getProducts: (query: { search?: string; page?: number; pageSize?: number }) => Promise<{
			items: T[];
			total?: number;
			page?: number;
			pageSize?: number;
			pagination?: { total: number; page: number; pageSize: number; totalPages: number };
		}>;
		deleteProduct?: (id: string) => Promise<void>;
		bulkDeleteProducts?: (ids: string[]) => Promise<unknown>;
	};
	columns: ColumnDef<T>[];
	features: ItemGridFeature[];
}

export function WidgetItemGrid<T extends { id: string }>({ service, columns, features }: WidgetItemGridProps<T>) {
	const { query, setSearch, setPage } = useWidgetQuery(features as unknown[]);

	const searchConfig = features
		.map(f => resolveFeature<SearchConfig>(f as string | SearchConfig, 'search'))
		.find(Boolean);
	const paginationConfig = features
		.map(f => resolveFeature<PaginationConfig>(f as string | PaginationConfig, 'pagination'))
		.find(Boolean);
	const crudConfig = features.map(f => resolveFeature<CrudConfig>(f as string | CrudConfig, 'crud')).find(Boolean);
	const bulkDeleteConfig = features
		.map(f => resolveFeature<BulkDeleteConfig>(f as string | BulkDeleteConfig, 'bulk-delete'))
		.find(Boolean);

	const { items, loading, pagination, refresh } = useWidgetDataFetch({
		fetchFn: async q => {
			const params: { search?: string; page?: number; pageSize?: number } = {};
			if (q.search) params.search = q.search;
			if (paginationConfig) {
				params.page = q.page;
				params.pageSize = q.pageSize;
			}
			return await service.getProducts(params);
		},
		query,
	});

	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<T | null>(null);

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
		console.log('Save:', data);
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
				{crudConfig && (
					<Button onClick={handleCreate}>
						<Plus className="size-4" />
						Add
					</Button>
				)}
			</div>

			{loading ? (
				<div className="p-8 text-center">Loading...</div>
			) : items.length === 0 ? (
				<div className="p-8 text-center">No items found</div>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{items.map(item => (
						<div key={item.id} className="rounded-lg border border-border bg-card p-4">
							{bulkDeleteConfig && (
								<div className="mb-2">
									<Checkbox
										checked={selectedIds.has(item.id)}
										onCheckedChange={() => toggleSelect(item.id)}
									/>
								</div>
							)}
							<div className="space-y-2">
								{columns.slice(0, 4).map(col => (
									<div key={col.key as string} className="text-sm">
										<span className="font-semibold">{col.label}: </span>
										{renderCellValue(item, col)}
									</div>
								))}
							</div>
							{crudConfig && (
								<div className="mt-4 flex gap-2">
									<Button onClick={() => handleEdit(item)} size="sm" variant="outline">
										<Edit className="size-3" />
										Edit
									</Button>
									<Button onClick={() => handleDelete(item.id)} size="sm" variant="destructive">
										<Trash2 className="size-3" />
										Delete
									</Button>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{paginationConfig && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Page {pagination.page} of {pagination.totalPages}
					</div>
					<Pagination
						currentPage={pagination.page}
						totalPages={pagination.totalPages}
						onPageChange={setPage}
					/>
				</div>
			)}

			{dialogOpen && crudConfig && crudConfig.dialog && (
				<crudConfig.dialog item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</div>
	);
}
