import { type MutableRefObject, useEffect, useMemo, useState } from 'react';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';

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

	const renderCellValue = (item: T, col: ColumnDef<T>) => {
		if (col.render) {
			return col.render(item);
		}

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

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex items-center gap-2">
				{searchFeature && (
					<SearchInput
						value={searchFeature.value}
						onChange={searchFeature.onChange}
						placeholder={searchFeature.placeholder || 'Search...'}
						className="flex-1"
					/>
				)}
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
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{items.map(item => (
						<div key={item.id} className="rounded-lg border border-border bg-card p-4">
							{bulkDeleteFeature && (
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
							{crudFeature && (
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

			{paginationFeature && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Page {pagination.page} of {pagination.totalPages}
					</div>
					<Pagination
						currentPage={pagination.page}
						totalPages={pagination.totalPages}
						onPageChange={paginationFeature.setPage}
					/>
				</div>
			)}

			{dialogOpen && crudFeature && crudFeature.dialog && (
				<crudFeature.dialog item={editingItem} onSave={handleDialogSave} onClose={handleDialogClose} />
			)}
		</div>
	);
}
