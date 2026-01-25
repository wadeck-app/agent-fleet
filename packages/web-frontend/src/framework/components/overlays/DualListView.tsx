import type { ReactNode } from 'react';
import { useState } from 'react';

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

import { SearchBar } from '../../features/search/SearchBar';

/**
 * ===========================================================================================
 * DUAL LIST VIEW (PURE PRESENTATION)
 * ===========================================================================================
 *
 * Pure presentation component for rendering dual-list UI.
 * This component is completely stateless and UI-focused.
 *
 * Responsibilities:
 * - Render two columns (left = associated, right = available)
 * - Apply visual states (opacity-50 for loading/reordering)
 * - Handle drag & drop interactions (forward to onReorder callback)
 * - Handle search filtering (client-side)
 * - Forward all user actions to callbacks (no logic)
 *
 * Does NOT handle:
 * - Optimistic updates (handled by useDualListState hook)
 * - API calls (handled by parent)
 * - State management (handled by useDualListState hook)
 *
 * Benefits:
 * - 100% testable without mocks (pure UI)
 * - Reusable across different layouts (Dialog, Grid, Table)
 * - Easy to swap interaction patterns (DnD → arrows)
 * - Clear visual testing (opacity, classes, rendering)
 *
 * Usage:
 *   const state = useDualListState({ ... });
 *
 *   <DualListView
 *     leftItems={state.leftItems}
 *     rightItems={state.rightItems}
 *     loadingItems={state.loadingItems}
 *     reorderingItems={state.reorderingIds}
 *     onAssociate={state.actions.associate}
 *     onDissociate={state.actions.dissociate}
 *     onReorder={state.actions.reorder}
 *     renderItem={(item, side, visualState) => <YourItemComponent {...} />}
 *   />
 *
 * ===========================================================================================
 */

export interface DualListViewProps<T> {
	// =========================================================================
	// DATA (from useDualListState)
	// =========================================================================

	/** Items in left panel (associated) */
	leftItems: T[];
	/** Items in right panel (available) */
	rightItems: T[];
	/** Extract key from item */
	itemKey: (item: T) => string;

	// =========================================================================
	// VISUAL STATE (from useDualListState)
	// =========================================================================

	/** Set of item IDs currently loading */
	loadingItems: Set<string>;
	/** Set of item IDs currently reordering */
	reorderingItems: Set<string>;

	// =========================================================================
	// RENDERING
	// =========================================================================

	/** Left panel title */
	leftTitle: string;
	/** Right panel title */
	rightTitle: string;

	/**
	 * Render an item with its visual state and callbacks
	 * @param item - The item to render
	 * @param side - Which panel ('left' or 'right')
	 * @param state - Visual state flags + callbacks
	 * @returns ReactNode to render
	 */
	renderItem: (
		item: T,
		side: 'left' | 'right',
		state: {
			isLoading: boolean;
			isReordering: boolean;
			onAssociate: (itemId: string) => void;
			onDissociate: (itemId: string) => void;
		}
	) => ReactNode;

	/** Left empty state (optional) */
	leftEmptyState?: ReactNode;
	/** Right empty state (optional) */
	rightEmptyState?: ReactNode;

	/** Left help text (optional) */
	leftHelpText?: string;
	/** Right help text (optional) */
	rightHelpText?: string;

	// =========================================================================
	// SEARCH (client-side filtering)
	// =========================================================================

	/** Search placeholder */
	searchPlaceholder?: string;
	/** Search filter function */
	searchFilter: (item: T, query: string) => boolean;

	// =========================================================================
	// CALLBACKS (forward to parent)
	// =========================================================================

	/** Callback when user clicks to associate an item */
	onAssociate: (itemId: string) => void;
	/** Callback when user clicks to dissociate an item */
	onDissociate: (itemId: string) => void;
	/** Callback when user drag-drops to reorder (optional) */
	onReorder?: (activeId: string, overId: string) => void;
}

export function DualListView<T>({
	leftItems,
	rightItems,
	itemKey,
	loadingItems,
	reorderingItems,
	leftTitle,
	rightTitle,
	renderItem,
	leftEmptyState,
	rightEmptyState,
	leftHelpText,
	rightHelpText,
	searchPlaceholder = 'Search...',
	searchFilter,
	onAssociate,
	onDissociate,
	onReorder,
}: DualListViewProps<T>) {
	// =========================================================================
	// LOCAL STATE (UI only, no business logic)
	// =========================================================================

	const [searchQuery, setSearchQuery] = useState('');

	// =========================================================================
	// DRAG & DROP SETUP
	// =========================================================================

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || !onReorder) return;
		if (active.id === over.id) return;

		// Forward to parent callback (no logic here)
		onReorder(String(active.id), String(over.id));
	};

	// =========================================================================
	// FILTERED ITEMS (client-side search)
	// =========================================================================

	const filteredRightItems = searchQuery ? rightItems.filter(item => searchFilter(item, searchQuery)) : rightItems;

	// =========================================================================
	// RENDER
	// =========================================================================

	return (
		<div className="grid grid-cols-2 gap-6 p-6">
			{/* ===================================================================== */}
			{/* LEFT PANEL (Associated items with drag & drop) */}
			{/* ===================================================================== */}
			<div className="space-y-4">
				{/* Header */}
				<div>
					<h3 className="text-sm font-semibold">{leftTitle}</h3>
					{leftHelpText && <p className="text-xs text-muted-foreground">{leftHelpText}</p>}
				</div>

				{/* Items (with DnD) */}
				{leftItems.length === 0 ? (
					leftEmptyState || (
						<div className="flex items-center justify-center rounded border border-dashed py-8 text-sm text-muted-foreground">
							No items
						</div>
					)
				) : (
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
						<SortableContext
							items={leftItems.map(item => itemKey(item))}
							strategy={verticalListSortingStrategy}
						>
							<div className="space-y-1">
								{leftItems.map(item => {
									const id = itemKey(item);
									const isLoading = loadingItems.has(id);
									const isReordering = reorderingItems.has(id);

									return (
										<div key={id}>
											{renderItem(item, 'left', {
												isLoading,
												isReordering,
												onAssociate,
												onDissociate,
											})}
										</div>
									);
								})}
							</div>
						</SortableContext>
					</DndContext>
				)}
			</div>

			{/* ===================================================================== */}
			{/* RIGHT PANEL (Available items with search) */}
			{/* ===================================================================== */}
			<div className="space-y-4">
				{/* Header */}
				<div>
					<h3 className="text-sm font-semibold">{rightTitle}</h3>
					{rightHelpText && <p className="text-xs text-muted-foreground">{rightHelpText}</p>}
				</div>

				{/* Search */}
				<SearchBar
					value={searchQuery}
					onChange={setSearchQuery}
					onClear={() => setSearchQuery('')}
					placeholder={searchPlaceholder}
					className="w-full"
				/>

				{/* Items */}
				{filteredRightItems.length === 0 ? (
					rightEmptyState || (
						<div className="flex items-center justify-center rounded border border-dashed py-8 text-sm text-muted-foreground">
							{searchQuery ? 'No results' : 'No items'}
						</div>
					)
				) : (
					<div className="space-y-1">
						{filteredRightItems.map(item => {
							const id = itemKey(item);
							const isLoading = loadingItems.has(id);

							return (
								<div key={id}>
									{renderItem(item, 'right', {
										isLoading,
										isReordering: false, // Right panel items never reorder
										onAssociate,
										onDissociate,
									})}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
