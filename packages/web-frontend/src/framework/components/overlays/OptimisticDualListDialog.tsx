import type { ReactNode } from 'react';

import { type UseDualListStateProps, useDualListState } from '../../hooks/useDualListState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './Dialog';
import { DualListView, type DualListViewProps } from './DualListView';

/**
 * ===========================================================================================
 * OPTIMISTIC DUAL LIST DIALOG (COMPOSITION LAYER)
 * ===========================================================================================
 *
 * High-level dialog that combines:
 * - Logic layer: useDualListState hook (handles optimistic updates, loading states)
 * - Presentation layer: DualListView component (pure UI)
 * - Dialog wrapper: Radix UI Dialog (modal behavior)
 *
 * This component simply wires everything together - no business logic or visual logic here.
 *
 * Architecture:
 * ```
 * OptimisticDualListDialog (composition)
 *   ├─ Dialog (Radix UI - modal wrapper)
 *   ├─ useDualListState (logic hook - optimistic updates)
 *   └─ DualListView (pure view - rendering)
 * ```
 *
 * Usage:
 *   <OptimisticDualListDialog
 *     open={open}
 *     onOpenChange={onOpenChange}
 *     title="Manage Items"
 *     allItems={items}
 *     associatedIds={new Set(associatedIds)}
 *     itemKey={item => item.id}
 *     leftTitle="Associated"
 *     rightTitle="Available"
 *     renderItem={(item, side, state) => <MyItemComponent {...} />}
 *     searchFilter={(item, query) => item.name.includes(query)}
 *     onAssociate={handleAssociate}
 *     onDissociate={handleDissociate}
 *     onReorder={handleReorder}
 *   />
 *
 * ===========================================================================================
 */

export interface OptimisticDualListDialogProps<T>
	extends
		Omit<UseDualListStateProps<T>, 'isOpen'>,
		Omit<
			DualListViewProps<T>,
			| 'leftItems'
			| 'rightItems'
			| 'loadingItems'
			| 'reorderingItems'
			| 'onAssociate'
			| 'onDissociate'
			| 'onReorder'
		> {
	// Dialog props
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** Dialog title */
	title: string;
	/** Max width of dialog */
	maxWidth?: '4xl' | '5xl';
}

export function OptimisticDualListDialog<T>({
	// Dialog props
	open,
	onOpenChange,
	title,
	maxWidth = '4xl',

	// Hook props (logic)
	allItems,
	associatedIds,
	itemKey,
	onAssociate,
	onDissociate,
	onReorder,

	// View props (presentation)
	leftTitle,
	rightTitle,
	renderItem,
	leftEmptyState,
	rightEmptyState,
	leftHelpText,
	rightHelpText,
	searchPlaceholder,
	searchFilter,
}: OptimisticDualListDialogProps<T>) {
	// =========================================================================
	// LOGIC LAYER (useDualListState hook)
	// =========================================================================

	const { leftItems, rightItems, loadingItems, reorderingIds, actions } = useDualListState({
		allItems,
		associatedIds,
		itemKey,
		onAssociate,
		onDissociate,
		onReorder,
		isOpen: open,
	});

	// =========================================================================
	// RENDER (compose Dialog + DualListView)
	// =========================================================================

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={maxWidth === '5xl' ? 'sm:max-w-5xl' : 'sm:max-w-4xl'}
				aria-describedby={undefined}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				{/* PRESENTATION LAYER (DualListView) */}
				<DualListView
					// Data from hook
					leftItems={leftItems}
					rightItems={rightItems}
					loadingItems={loadingItems}
					reorderingItems={reorderingIds}
					itemKey={itemKey}
					// Actions from hook
					onAssociate={actions.associate}
					onDissociate={actions.dissociate}
					onReorder={actions.reorder}
					// View props
					leftTitle={leftTitle}
					rightTitle={rightTitle}
					renderItem={renderItem}
					leftEmptyState={leftEmptyState}
					rightEmptyState={rightEmptyState}
					leftHelpText={leftHelpText}
					rightHelpText={rightHelpText}
					searchPlaceholder={searchPlaceholder}
					searchFilter={searchFilter}
				/>
			</DialogContent>
		</Dialog>
	);
}
