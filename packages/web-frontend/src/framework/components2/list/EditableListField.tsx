import type { ReactNode } from 'react';

import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Label } from '@framework/components/forms/Label';
import { useDragAndDrop } from '@framework/hooks2/form/useDragAndDrop';
import type { ListItemsContract } from '@framework/hooks2/form/useListItems';

import { AddButton } from './AddButton';
import { SortableItem } from './SortableItem';

/**
 * ===========================================================================================
 * EDITABLE LIST FIELD - Generic List Editor Component
 * ===========================================================================================
 *
 * Generic composable component for displaying and editing a list of items.
 * Inspired by the DataView/Table/Grid pattern with headless hooks.
 *
 * Features:
 * - Type-safe with generics
 * - Composable item rendering via renderItem prop
 * - Optional drag & drop reordering
 * - Add/remove actions with constraint enforcement
 * - Empty state customization
 * - Form field integration (label, description, error)
 *
 * Example usage:
 * ```typescript
 * const items = useListItems<KeyValueItem>({
 *   initialItems: [{ key: 'foo', value: 'bar' }],
 *   createDefault: () => ({ key: '', value: '' }),
 * });
 *
 * <EditableListField
 *   label="Environment Variables"
 *   items={items}
 *   renderItem={(item, index, actions) => (
 *     <KeyValueItemRenderer item={item} actions={actions} />
 *   )}
 *   addButtonLabel="Add Variable"
 *   enableReordering
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface ItemActions<T> {
	/** Update the item with partial data */
	update: (partial: Partial<T>) => void;
	/** Remove the item from the list */
	remove: () => void;
}

export interface EditableListFieldProps<T> {
	// Core hooks
	/** List items hook contract */
	items: ListItemsContract<T>;

	// Rendering
	/** Function to render each item with actions */
	renderItem: (item: T, index: number, actions: ItemActions<T>) => ReactNode;
	/** Optional custom empty state renderer */
	renderEmpty?: () => ReactNode;

	// Labels
	/** Field label */
	label?: string;
	/** Field description */
	description?: string;
	/** Error message */
	error?: string;
	/** Add button label (default: "Add Item") */
	addButtonLabel?: string;
	/** Empty state message (default: "No items") */
	emptyMessage?: string;

	// Features
	/** Enable drag & drop reordering */
	enableReordering?: boolean;
	/** Factory function to create default items when adding */
	createDefault: () => T;

	/**
	 * Function to extract unique ID from item for React keys.
	 * Falls back to array index if not provided (not recommended for dynamic lists).
	 *
	 * @example
	 * // Using a stable ID property
	 * getItemId={(item) => item.id}
	 *
	 * @example
	 * // Using a name property
	 * getItemId={(item) => item.name || `temp-${index}`}
	 */
	getItemId?: (item: T, index: number) => string | number;

	// Styling
	/** Additional CSS classes */
	className?: string;
}

export function EditableListField<T>({
	items,
	renderItem,
	renderEmpty,
	label,
	description,
	error,
	addButtonLabel = 'Add Item',
	emptyMessage = 'No items',
	enableReordering = false,
	createDefault,
	getItemId,
	className = '',
}: EditableListFieldProps<T>) {
	const { fstate, actions } = items;

	// Default getItemId function falls back to index
	const resolveItemId = getItemId || ((_item: T, index: number) => index);

	// Setup drag & drop functionality
	const dnd = useDragAndDrop({
		items: fstate.items,
		getItemId: resolveItemId,
		onReorder: actions.reorder,
		disabled: !enableReordering,
		activationConstraint: { distance: 8 },
	});

	const handleAddItem = () => {
		if (fstate.canAdd) {
			actions.add(createDefault());
		}
	};

	return (
		<div className={className}>
			{/* Label and Description */}
			{label && (
				<div className="mb-2">
					<Label>{label}</Label>
					{description && <p className="text-xs text-muted-foreground">{description}</p>}
				</div>
			)}

			{/* Items List or Empty State */}
			{fstate.isEmpty ? (
				<div className="rounded-md border border-dashed bg-muted/30 px-8 py-4 text-center">
					{renderEmpty ? renderEmpty() : <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
				</div>
			) : (
				<DndContext
					sensors={enableReordering ? dnd.sensors : undefined}
					collisionDetection={closestCenter}
					onDragEnd={dnd.handleDragEnd}
				>
					<SortableContext
						items={dnd.sortableIds}
						strategy={verticalListSortingStrategy}
						disabled={!enableReordering}
					>
						<div className="space-y-2">
							{fstate.items.map((item, index) => {
								const itemId = resolveItemId(item, index);
								return (
									<SortableItem key={itemId} id={itemId} disabled={!enableReordering}>
										{renderItem(item, index, {
											update: partial => actions.update(index, partial),
											remove: () => actions.remove(index),
										})}
									</SortableItem>
								);
							})}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{/* Add Button */}
			<AddButton onClick={handleAddItem} disabled={!fstate.canAdd}>
				{addButtonLabel}
			</AddButton>

			{/* Error Message */}
			{error && <p className="mt-2 text-xs text-destructive">{error}</p>}
		</div>
	);
}
