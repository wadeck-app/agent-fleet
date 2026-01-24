import { type ReactNode, useState } from 'react';

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
import { SearchBar } from '@framework/features/search/SearchBar';

import { CrudDialog } from './CrudDialog';

/**
 * ===========================================================================================
 * DUAL LIST DIALOG COMPONENT
 * ===========================================================================================
 *
 * Generic reusable component for managing two lists (associated/pinned vs available).
 * Provides a two-column layout with drag & drop reordering, search, and customizable rendering.
 *
 * Features:
 * - Two-column layout: Left (associated/pinned) and Right (available)
 * - Drag & drop reordering for left column items
 * - Real-time search filtering for right column
 * - Customizable item rendering via render props
 * - Loading and reordering state management
 * - Optimistic updates support (optional)
 * - Customizable empty states
 * - Help text for user guidance
 *
 * This component replaces:
 * - ManagePinnedProjectsDialog.tsx (252 lines)
 * - ManageProjectWorkspacesDialog.tsx (344 lines)
 *
 * Total reduction: 596 lines → ~150 lines (with this component)
 *
 * Usage:
 *   <DualListDialog
 *     open={isOpen}
 *     onOpenChange={setIsOpen}
 *     title="Manage Items"
 *     maxWidth="4xl"
 *     leftTitle="Associated Items"
 *     leftItems={associatedItems}
 *     leftItemKey={item => item.id}
 *     leftItemRenderer={(item, actions) => (
 *       <SortableItem item={item} onRemove={handleRemove} {...actions} />
 *     )}
 *     leftEmptyState={<EmptyState icon="🔗" message="No items" />}
 *     onReorder={handleReorder}
 *     rightTitle="Available Items"
 *     rightItems={availableItems}
 *     rightItemKey={item => item.id}
 *     rightItemRenderer={(item, actions) => (
 *       <AvailableItem item={item} onAdd={handleAdd} {...actions} />
 *     )}
 *     rightEmptyState={<EmptyState icon="✨" message="All items added" />}
 *     searchPlaceholder="Search items..."
 *     searchFilter={(item, query) => item.name.includes(query)}
 *     loadingItems={loadingItems}
 *     reorderingItems={reorderingIds}
 *   />
 *
 * ===========================================================================================
 */

export interface DualListDialogProps<TLeft, TRight> {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** Dialog title */
	title: string;
	/** Maximum width of the dialog */
	maxWidth?: '4xl' | '5xl';

	// Left panel (associated/pinned items)
	/** Title for the left panel */
	leftTitle: string;
	/** Items to display in the left panel */
	leftItems: TLeft[];
	/** Function to extract unique key from left item */
	leftItemKey: (item: TLeft) => string;
	/** Function to render a left item */
	leftItemRenderer: (item: TLeft, actions: ItemActions) => ReactNode;
	/** Custom empty state for left panel (optional) */
	leftEmptyState?: ReactNode;
	/** Help text displayed below left items (optional) */
	leftHelpText?: string;
	/** Callback when items are reordered (optional) */
	onReorder?: (activeId: string, overId: string) => Promise<void>;

	// Right panel (available items)
	/** Title for the right panel */
	rightTitle: string;
	/** Items to display in the right panel */
	rightItems: TRight[];
	/** Function to extract unique key from right item */
	rightItemKey: (item: TRight) => string;
	/** Function to render a right item */
	rightItemRenderer: (item: TRight, actions: ItemActions) => ReactNode;
	/** Custom empty state for right panel when no items (optional) */
	rightEmptyState?: ReactNode;
	/** Custom empty state for right panel when search has no results (optional) */
	rightEmptySearchState?: ReactNode;
	/** Help text displayed below right items (optional) */
	rightHelpText?: string;
	/** Placeholder text for the search bar */
	searchPlaceholder?: string;
	/** Function to filter right items by search query */
	searchFilter: (item: TRight, query: string) => boolean;

	// State management
	/** Set of item IDs that are currently loading */
	loadingItems?: Set<string>;
	/** Set of item IDs that are currently being reordered */
	reorderingItems?: Set<string>;

	// Optimistic updates (optional)
	/** Optimistic update state for immediate UI feedback */
	optimisticMode?: {
		/** Item IDs that have been optimistically added to left panel */
		associations: Set<string>;
		/** Item IDs that have been optimistically removed from left panel */
		dissociations: Set<string>;
	};
}

export interface ItemActions {
	/** Whether this item is in a loading state */
	isLoading: boolean;
	/** Whether this item is being reordered */
	isReordering: boolean;
}

export function DualListDialog<TLeft, TRight>({
	open,
	onOpenChange,
	title,
	maxWidth = '4xl',
	leftTitle,
	leftItems,
	leftItemKey,
	leftItemRenderer,
	leftEmptyState,
	leftHelpText,
	onReorder,
	rightTitle,
	rightItems,
	rightItemKey,
	rightItemRenderer,
	rightEmptyState,
	rightEmptySearchState,
	rightHelpText,
	searchPlaceholder = 'Search...',
	searchFilter,
	loadingItems = new Set(),
	reorderingItems = new Set(),
}: DualListDialogProps<TLeft, TRight>) {
	const [searchQuery, setSearchQuery] = useState('');

	// Configure drag & drop sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // Require 8px of movement before activating drag
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	// Filter right items by search query
	const filteredRightItems = rightItems.filter(item => searchFilter(item, searchQuery));

	// Handle drag end for reordering
	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id || !onReorder) {
			return;
		}

		try {
			await onReorder(active.id as string, over.id as string);
		} catch (error) {
			console.error('Failed to reorder items:', error);
		}
	};

	// Default empty states
	const defaultLeftEmptyState = (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="mb-2 text-3xl text-muted-foreground">📋</div>
			<p className="text-sm text-muted-foreground">No items</p>
			<p className="text-xs text-muted-foreground">Add items from the right panel</p>
		</div>
	);

	const defaultRightEmptyState = (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="mb-2 text-3xl text-muted-foreground">✨</div>
			<p className="text-sm text-muted-foreground">All items are added</p>
		</div>
	);

	const defaultRightEmptySearchState = (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="mb-2 text-3xl text-muted-foreground">🔍</div>
			<p className="text-sm text-muted-foreground">No items match your search</p>
		</div>
	);

	return (
		<CrudDialog open={open} onOpenChange={onOpenChange} title={title} maxWidth={maxWidth} showCloseButton={true}>
			<div className="grid grid-cols-2 gap-6 p-6">
				{/* Left Column: Associated/Pinned Items */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">{leftTitle}</h3>
					</div>

					{leftItems.length === 0 ? (
						leftEmptyState || defaultLeftEmptyState
					) : (
						<>
							{onReorder ? (
								<DndContext
									sensors={sensors}
									collisionDetection={closestCenter}
									onDragEnd={handleDragEnd}
								>
									<SortableContext
										items={leftItems.map(leftItemKey)}
										strategy={verticalListSortingStrategy}
									>
										<div className="space-y-1">
											{leftItems.map(item => {
												const key = leftItemKey(item);
												return (
													<div key={key}>
														{leftItemRenderer(item, {
															isLoading: loadingItems.has(key),
															isReordering: reorderingItems.has(key),
														})}
													</div>
												);
											})}
										</div>
									</SortableContext>
								</DndContext>
							) : (
								<div className="space-y-1">
									{leftItems.map(item => {
										const key = leftItemKey(item);
										return (
											<div key={key}>
												{leftItemRenderer(item, {
													isLoading: loadingItems.has(key),
													isReordering: reorderingItems.has(key),
												})}
											</div>
										);
									})}
								</div>
							)}

							{leftHelpText && <p className="text-xs text-muted-foreground">{leftHelpText}</p>}
						</>
					)}
				</div>

				{/* Right Column: Available Items */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">{rightTitle}</h3>
					</div>

					{/* Search Bar */}
					<SearchBar
						value={searchQuery}
						onChange={setSearchQuery}
						onClear={() => setSearchQuery('')}
						placeholder={searchPlaceholder}
						label=""
						className="mb-2"
					/>

					{rightItems.length === 0 ? (
						rightEmptyState || defaultRightEmptyState
					) : filteredRightItems.length === 0 ? (
						rightEmptySearchState || defaultRightEmptySearchState
					) : (
						<>
							<div className="max-h-[400px] space-y-1 overflow-y-auto">
								{filteredRightItems.map(item => {
									const key = rightItemKey(item);
									return (
										<div key={key}>
											{rightItemRenderer(item, {
												isLoading: loadingItems.has(key),
												isReordering: false, // Right items are never reordered
											})}
										</div>
									);
								})}
							</div>

							{rightHelpText && <p className="text-xs text-muted-foreground">{rightHelpText}</p>}
						</>
					)}
				</div>
			</div>
		</CrudDialog>
	);
}
