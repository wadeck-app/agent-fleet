import { useMemo, useState } from 'react';

import { Checkbox } from '@framework/components/forms/Checkbox';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { SearchInput } from '@framework/components/search/SearchInput';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { ItemGridFeature } from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';

/**
 * ===========================================================================================
 * VIEW ITEM GRID
 * ===========================================================================================
 *
 * Grid view component that reads from ProductDomainContext.
 * NO service prop, NO data prop - reads everything from context.
 *
 * Features:
 * - search: Search input in toolbar
 * - pagination: Pagination controls
 * - crud: Create/edit/delete operations with dialog
 * - bulk-delete: Select multiple items and delete
 *
 * Renders items in a responsive grid layout.
 *
 * ===========================================================================================
 */

export interface ViewItemGridProps<T = Product> {
	columns: ColumnDef<T>[];
	features: ItemGridFeature[];
}

export function ViewItemGrid<T extends Product = Product>({ columns, features }: ViewItemGridProps<T>) {
	const context = useProductDomain();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<T | null>(null);

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

	const toggleSelection = (id: string) => {
		setSelectedIds(prev => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	/**
	 * Render a field value based on column definition
	 */
	const renderFieldValue = (item: T, col: ColumnDef<T>) => {
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
				{searchConfig && (
					<SearchInput
						value={context.query.search}
						onChange={value => context.actions.setQuery({ search: value })}
						placeholder="Search..."
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

			{bulkDeleteConfig && selectedIds.size > 0 && (
				<div className="flex items-center justify-between rounded-md bg-muted p-4">
					<span className="text-sm">{selectedIds.size} items selected</span>
					<Button variant="destructive" size="sm" onClick={handleBulkDelete}>
						<Trash2 className="mr-2 size-4" />
						Delete Selected
					</Button>
				</div>
			)}

			{context.loading ? (
				<div className="p-8 text-center">Loading...</div>
			) : context.items.length === 0 ? (
				<div className="p-8 text-center">No items found</div>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{(context.items as T[]).map(item => (
						<div key={item.id} className="rounded-lg border border-border bg-card p-4">
							{bulkDeleteConfig && (
								<div className="mb-2">
									<Checkbox
										checked={selectedIds.has(item.id)}
										onCheckedChange={() => toggleSelection(item.id)}
									/>
								</div>
							)}
							<div className="space-y-2">
								{columns.slice(0, 4).map(col => (
									<div key={String(col.key)} className="text-sm">
										<span className="font-semibold">{col.label}: </span>
										{renderFieldValue(item, col)}
									</div>
								))}
							</div>
							{crudConfig && (
								<div className="mt-4 flex gap-2">
									<Button onClick={() => handleEdit(item)} size="sm" variant="outline">
										<Edit className="size-3" />
										Edit
									</Button>
									<Button onClick={() => handleDelete(item)} size="sm" variant="destructive">
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
						Page {context.pagination.page} of {context.pagination.totalPages}
					</div>
					<Pagination
						currentPage={context.pagination.page}
						totalPages={context.pagination.totalPages}
						onPageChange={page => context.actions.setQuery({ page })}
					/>
				</div>
			)}

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
