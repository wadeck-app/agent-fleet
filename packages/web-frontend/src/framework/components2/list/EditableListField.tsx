import type { ReactNode } from 'react';

import {
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Label } from '@framework/components/forms/Label';
import { Button } from '@framework/components/primitives/Button';
import type { ListItemsContract } from '@framework/hooks2/useListItems';
import { Plus } from 'lucide-react';

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

	// Setup dnd-kit sensors for drag & drop
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // Require 8px movement before drag starts (prevents accidental drags)
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (over && active.id !== over.id) {
			const fromIndex = fstate.items.findIndex((item, i) => resolveItemId(item, i) === active.id);
			const toIndex = fstate.items.findIndex((item, i) => resolveItemId(item, i) === over.id);
			actions.reorder(fromIndex, toIndex);
		}
	};

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
				<div className="rounded-md border border-dashed bg-muted/30 p-8 text-center">
					{renderEmpty ? (
						renderEmpty()
					) : (
						<p className="text-sm text-muted-foreground">{emptyMessage}</p>
					)}
				</div>
			) : (
				<DndContext
					sensors={enableReordering ? sensors : undefined}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={fstate.items.map((item, i) => resolveItemId(item, i))}
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
			<div className="mt-3">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleAddItem}
					disabled={!fstate.canAdd}
				>
					<Plus className="size-4" />
					{addButtonLabel}
				</Button>
			</div>

			{/* Error Message */}
			{error && <p className="mt-2 text-xs text-destructive">{error}</p>}
		</div>
	);
}
