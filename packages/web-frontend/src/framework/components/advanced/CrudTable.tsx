import { useState } from 'react';

import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Button } from '@framework/components/primitives/Button';
import { Table } from '@framework/components/table/Table';
import { type TablePaginationConfig } from '@framework/components/table/Table';
import { type TableSortingConfig } from '@framework/components/table/Table';
import { type TableColumn } from '@framework/components/table/Table';
import { applyColumnOrder } from '@framework/utils/table/columnOrdering';
import { Pencil, Trash2 } from 'lucide-react';

/**
 * ===========================================================================================
 * CRUD TABLE - Generic CRUD Operations Table
 * ===========================================================================================
 *
 * Generic component for displaying entities with CRUD operations in a table.
 * - Receives data via props (presentation-only)
 * - Emits events via callbacks
 * - Handles delete confirmation dialogs
 * - Provides Edit/Delete action buttons
 * - Supports pagination, sorting, selection, column visibility
 *
 * Usage:
 * ```tsx
 * const config: CrudTableConfig<Book> = {
 *   getItemDisplayName: (book) => book.title,
 *   emptyMessage: 'No books found.',
 *   itemTypeName: 'book',
 * };
 *
 * <CrudTable
 *   data={books}
 *   columns={BOOK_COLUMNS}
 *   config={config}
 *   onDelete={handleDelete}
 *   onEdit={handleEdit}
 *   pagination={paginationConfig}
 *   sorting={sortingConfig}
 * />
 * ```
 *
 * ===========================================================================================
 */

// Add comment above the target line, not at the end
/**
 * Base interface for items that can be used with CrudTable
 */
export interface CrudTableItem {
	id: string;
}

// Add comment above the target line, not at the end
/**
 * Configuration for CRUD table behavior
 */
export interface CrudTableConfig<T extends CrudTableItem> {
	// Add comment above the target line, not at the end
	/**
	 * Display name extractor for delete confirmations
	 * @example (book) => book.title
	 * @example (ingredient) => ingredient.name
	 */
	getItemDisplayName: (item: T) => string;

	// Add comment above the target line, not at the end
	/**
	 * Custom message for empty state
	 */
	emptyMessage: string;

	// Add comment above the target line, not at the end
	/**
	 * Item type name for default messages (singular form)
	 * @example "book", "ingredient", "user"
	 */
	itemTypeName: string;

	// Add comment above the target line, not at the end
	/**
	 * Custom delete confirmation description
	 * Optional - defaults to "This action cannot be undone. The {itemType} will be permanently deleted."
	 */
	deleteDescription?: (item: T) => string;

	// Add comment above the target line, not at the end
	/**
	 * Edit button variant (optional, defaults to 'outline')
	 */
	editButtonVariant?: 'outline' | 'ghost' | 'default';
}

// Add comment above the target line, not at the end
/**
 * Props for CrudTable component
 */
export interface CrudTableProps<T extends CrudTableItem> {
	/** Unique identifier for persistent state (sorting, visibility, column order) */
	storageId: string;

	/** Array of items to display */
	data: T[];

	/** Column definitions using existing TableColumn type */
	columns: TableColumn<T>[];

	/** Configuration for CRUD behavior */
	config: CrudTableConfig<T>;

	/** Delete handler */
	onDelete: (id: string) => void;

	/** Optional edit handler - if not provided, edit button won't render */
	onEdit?: (item: T) => void;

	/** Optional pagination config (controlled by parent) */
	pagination?: TablePaginationConfig;

	/** Optional sorting config (controlled by parent) */
	sorting?: TableSortingConfig;

	/** Optional visible columns (controlled by parent) */
	visibleColumns?: Set<string>;

	/** Optional column order (controlled by parent) */
	columnOrder?: string[];

	/** Optional refreshing state */
	refreshing?: boolean;

	/** Optional deleting state */
	deleting?: boolean;

	/** Optional selectable mode */
	selectable?: boolean;

	/** Optional selected IDs */
	selectedIds?: Set<string>;

	/** Optional selection change handler */
	onSelectionChange?: (selectedIds: Set<string>) => void;

	/** Optional deleting IDs for strike-through */
	deletingIds?: Set<string>;
}

// Add comment above the target line, not at the end
/**
 * Generic CRUD table component
 * Abstracts common patterns for tables with Create, Read, Update, Delete operations
 */
export function CrudTable<T extends CrudTableItem>({
	storageId: _storageId,
	data,
	columns,
	config,
	onDelete,
	onEdit,
	pagination,
	sorting,
	visibleColumns,
	columnOrder,
	refreshing,
	deleting,
	selectable,
	selectedIds,
	onSelectionChange,
	deletingIds,
}: CrudTableProps<T>) {
	const [itemToDelete, setItemToDelete] = useState<T | null>(null);

	const handleDeleteClick = (item: T) => {
		setItemToDelete(item);
	};

	const handleConfirmDelete = () => {
		if (itemToDelete) {
			onDelete(itemToDelete.id);
			setItemToDelete(null);
		}
	};

	// Apply column order first (if provided)
	const orderedColumns = columnOrder ? applyColumnOrder(columns, columnOrder) : columns;

	// Then filter columns based on visibility
	const filteredColumns = visibleColumns ? orderedColumns.filter(col => visibleColumns.has(col.key)) : orderedColumns;

	const renderActions = (item: T) => (
		<div className="flex justify-center gap-2">
			{onEdit && (
				<Button
					size="sm"
					variant={config.editButtonVariant ?? 'outline'}
					onClick={() => onEdit(item)}
					aria-label={`Edit ${config.itemTypeName}`}
				>
					<Pencil className="size-4" />
				</Button>
			)}
			<Button
				size="sm"
				variant="destructive"
				onClick={() => handleDeleteClick(item)}
				aria-label={`Delete ${config.itemTypeName}`}
			>
				<Trash2 className="size-4" />
			</Button>
		</div>
	);

	// Delete confirmation message
	const deleteDescription = itemToDelete
		? config.deleteDescription
			? config.deleteDescription(itemToDelete)
			: `This action cannot be undone. The ${config.itemTypeName} will be permanently deleted.`
		: '';

	return (
		<>
			<Table
				data={data}
				columns={filteredColumns}
				getItemId={item => item.id}
				renderActions={renderActions}
				emptyMessage={config.emptyMessage}
				pagination={pagination}
				sorting={sorting}
				refreshing={refreshing}
				deleting={deleting}
				selectable={selectable}
				selectedIds={selectedIds}
				onSelectionChange={onSelectionChange}
				deletingIds={deletingIds}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialogWrapper
				open={itemToDelete !== null}
				onOpenChange={open => !open && setItemToDelete(null)}
				title={itemToDelete ? `Delete "${config.getItemDisplayName(itemToDelete)}"?` : ''}
				description={deleteDescription}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={handleConfirmDelete}
				variant="danger"
			/>
		</>
	);
}
