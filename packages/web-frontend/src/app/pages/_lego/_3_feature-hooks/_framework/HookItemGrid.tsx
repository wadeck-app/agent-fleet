import { type MutableRefObject, useEffect, useMemo, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego';
import { Edit, Plus, Trash2 } from 'lucide-react';

import { useWidgetDataFetch } from '@app/pages/_lego/_1_widget-isolated/_framework/useWidgetDataFetch';

import type { BulkDeleteFeatureHook } from './useBulkDeleteFeature';
import type { CrudFeatureHook } from './useCrudFeature';
import type { PaginationFeatureHook } from './usePaginationFeature';
import type { SearchFeatureHook } from './useSearchFeature';

/**
 * ===========================================================================================
 * HOOK ITEM GRID - Hook-Based Item Grid Widget
 * ===========================================================================================
 *
 * Grid-based data display widget that accepts feature hooks from the page.
 * Displays items in a card grid layout.
 *
 * ===========================================================================================
 */

export type ItemGridFeatureHook = SearchFeatureHook | PaginationFeatureHook | CrudFeatureHook | BulkDeleteFeatureHook;

export interface HookItemGridProps<T> {
	service: {
		getProducts: (query: { search?: string; page?: number; pageSize?: number }) => Promise<{
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
	features: ItemGridFeatureHook[];
	onRefreshRef?: MutableRefObject<(() => void) | undefined>;
}

export function HookItemGrid<T extends { id: string }>({
	service,
	columns,
	features,
	onRefreshRef,
}: HookItemGridProps<T>) {
	// Extract feature hooks by type
	const searchFeature = features.find(f => f.type === 'search') as SearchFeatureHook | undefined;
	const paginationFeature = features.find(f => f.type === 'pagination') as PaginationFeatureHook | undefined;
	const bulkDeleteFeature = features.find(f => f.type === 'bulk-delete') as BulkDeleteFeatureHook | undefined;
	const crudFeature = features.find(f => f.type === 'crud') as CrudFeatureHook | undefined;

	// Build query from feature hooks
	const query = useMemo(
		() => ({
			search: searchFeature?.value ?? '',
			page: paginationFeature?.page ?? 1,
			pageSize: paginationFeature?.pageSize ?? 10,
			sortBy: undefined,
			sortOrder: undefined,
		}),
		[searchFeature?.value, paginationFeature?.page, paginationFeature?.pageSize]
	);

	const { items, loading, pagination, refresh } = useWidgetDataFetch({
		fetchFn: async q => {
			const params: {
				search?: string;
				page?: number;
				pageSize?: number;
			} = {};
			if (q.search) params.search = q.search;
			if (paginationFeature) {
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

	useEffect(() => {
		if (onRefreshRef) {
			onRefreshRef.current = refresh;
		}
	}, [refresh, onRefreshRef]);

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

	const getFieldValue = (item: T, key: string | number | symbol): any => {
		return item[key as keyof T];
	};

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Products</h2>
				{crudFeature && (
					<Button onClick={handleCreate}>
						<Plus className="size-4" />
						Add
					</Button>
				)}
			</div>

			{bulkDeleteFeature && selectedIds.size > 0 && (
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

			{loading && <div className="p-8 text-center">Loading...</div>}

			{!loading && items.length === 0 && <div className="p-8 text-center">No items found</div>}

			{!loading && items.length > 0 && (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{items.map(item => (
						<div key={item.id} className="relative rounded-lg border border-border bg-card p-4">
							{(bulkDeleteFeature || crudFeature) && (
								<div className="absolute right-2 top-2">
									<Checkbox
										checked={selectedIds.has(item.id)}
										onCheckedChange={() => toggleSelect(item.id)}
									/>
								</div>
							)}
							<div className="space-y-2">
								{columns.slice(0, 4).map(col => {
									const value = getFieldValue(item, col.key);
									return (
										<div key={col.key as string}>
											<span className="text-sm font-semibold">{col.label}: </span>
											{col.type === 'enum' && col.badge ? (
												<Badge variant="secondary">{String(value)}</Badge>
											) : (
												<span className="text-sm">{String(value || '')}</span>
											)}
										</div>
									);
								})}
							</div>
							{crudFeature && (
								<div className="mt-4 flex gap-2">
									<Button onClick={() => handleEdit(item)} size="sm" variant="outline">
										<Edit className="size-3" />
										Edit
									</Button>
									<Button onClick={() => handleDelete(item.id)} size="sm" variant="outline">
										<Trash2 className="size-3" />
										Delete
									</Button>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{paginationFeature && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {items.length} of {pagination.total} items
					</div>
					<div className="flex items-center gap-4">
						<PageSizeSelector
							value={paginationFeature.pageSize}
							onChange={paginationFeature.setPageSize}
							options={paginationFeature.pageSizes || [10, 20, 50]}
						/>
						<Pagination
							currentPage={pagination.page}
							totalPages={pagination.totalPages}
							onPageChange={paginationFeature.setPage}
						/>
					</div>
				</div>
			)}

			{dialogOpen && crudFeature && crudFeature.dialog && (
				<crudFeature.dialog item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</div>
	);
}
