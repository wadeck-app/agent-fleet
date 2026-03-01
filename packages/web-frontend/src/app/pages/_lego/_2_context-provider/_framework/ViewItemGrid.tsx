import { useMemo, useState } from 'react';

import { Checkbox } from '@framework/components/forms/Checkbox';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Card } from '@framework/components/primitives/Card';
import { SearchInput } from '@framework/components/search/SearchInput';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { ItemGridFeature } from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Check, Edit, Minus, Plus, Trash2 } from 'lucide-react';

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

		if (col.type === 'number') {
			const prefix = col.prefix ?? '';
			const suffix = col.suffix ?? '';
			return `${prefix}${Number(value).toLocaleString()}${suffix}`;
		}

		if (col.type === 'enum' && col.badge) {
			return <Badge variant="secondary">{String(value)}</Badge>;
		}

		if (col.type === 'boolean') {
			return value ? (
				<Check className="size-4 text-primary" />
			) : (
				<Minus className="size-4 text-muted-foreground" />
			);
		}

		if (col.type === 'date') {
			return value ? new Date(value as string | number | Date).toLocaleDateString() : '–';
		}

		return String(value ?? '');
	};

	return (
		<div className="space-y-4">
			{searchConfig && (
				<div className="flex items-center gap-2">
					<SearchInput
						value={context.query.search}
						onChange={value => context.actions.setQuery({ search: value })}
						onClear={() => context.actions.setQuery({ search: '' })}
						placeholder="Search products..."
					/>
					{crudConfig && (
						<Button onClick={handleCreate}>
							<Plus className="mr-2 size-4" />
							Create
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

			{context.loading ? (
				<div className="text-center text-muted-foreground">Loading...</div>
			) : context.items.length === 0 ? (
				<div className="text-center text-muted-foreground">No items found</div>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{(context.items as T[]).map(item => (
						<Card key={item.id} className="p-4">
							<div className="space-y-2">
								{bulkDeleteConfig && (
									<div className="flex items-center justify-end">
										<Checkbox
											checked={selectedIds.has(item.id)}
											onCheckedChange={() => toggleSelection(item.id)}
										/>
									</div>
								)}

								{columns.map(col => (
									<div key={String(col.key)} className="flex justify-between">
										<span className="font-medium">{col.label}:</span>
										<span>{renderFieldValue(item, col)}</span>
									</div>
								))}

								{crudConfig && (
									<div className="flex gap-2 pt-2">
										<Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
											<Edit className="mr-2 size-4" />
											Edit
										</Button>
										<Button variant="destructive" size="sm" onClick={() => handleDelete(item)}>
											<Trash2 className="mr-2 size-4" />
											Delete
										</Button>
									</div>
								)}
							</div>
						</Card>
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
