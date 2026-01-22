import { useState } from 'react';

/**
 * ===========================================================================================
 * USE BULK DELETE STATE - Centralized State Management for Bulk Delete Operations
 * ===========================================================================================
 *
 * Eliminates boilerplate state management repeated across 15+ CRUD pages.
 * Manages all state needed for bulk delete operations with visual feedback.
 *
 * **Before (repeated in every CRUD page):**
 * ```typescript
 * const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
 * const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
 * const [isBulkDeleting, setIsBulkDeleting] = useState(false);
 * const [isRefreshingAfterMutation, setIsRefreshingAfterMutation] = useState(false);
 * const isMutating = useRef(false);
 * ```
 *
 * **After (one hook call):**
 * ```typescript
 * const bulkDelete = useBulkDeleteState();
 * ```
 *
 * **Features:**
 * - Dialog visibility state (`showDialog`)
 * - IDs being deleted for strike-through effect (`deletingIds`)
 * - Bulk delete in progress for blur effect (`isBulkDeleting`)
 * - Refreshing after mutation state (`isRefreshingAfterMutation`)
 * - Mutation tracking for cleanup timing
 *
 * **Usage Example:**
 * ```typescript
 * const bulkDelete = useBulkDeleteState();
 *
 * // Open bulk delete dialog
 * const handleBulkDelete = () => {
 *   if (selectedIds.size === 0) return;
 *   bulkDelete.openDialog();
 * };
 *
 * // Start deletion process
 * const handleStartDelete = (ids: string[]) => {
 *   bulkDelete.startDeleting(new Set(ids));
 * };
 *
 * // Clear state after completion
 * bulkDelete.clear();
 * ```
 *
 * ===========================================================================================
 */

export interface BulkDeleteState {
	/** Whether the bulk delete dialog is open */
	showDialog: boolean;
	/** IDs currently being deleted (for strike-through visual feedback) */
	deletingIds: Set<string>;
	/** Whether bulk delete operation is in progress (for blur effect) */
	isBulkDeleting: boolean;
	/** Whether we're refreshing after a mutation */
	isRefreshingAfterMutation: boolean;
	/** Whether a mutation is in progress (used for cleanup timing) */
	isMutating: boolean;
}

export interface BulkDeleteActions {
	/** Open the bulk delete dialog */
	openDialog: () => void;
	/** Close the bulk delete dialog */
	closeDialog: () => void;
	/** Set dialog open/closed state */
	setShowDialog: (show: boolean) => void;
	/** Start the deletion process (sets isBulkDeleting and marks as mutating) */
	startDeleting: (ids: Set<string>) => void;
	/** Set which IDs are currently being deleted */
	setDeletingIds: (ids: Set<string>) => void;
	/** Set whether bulk delete is in progress */
	setIsBulkDeleting: (deleting: boolean) => void;
	/** Set whether we're refreshing after a mutation */
	setIsRefreshingAfterMutation: (refreshing: boolean) => void;
	/** Mark that a mutation has started (for cleanup timing) */
	markMutating: () => void;
	/** Clear all deletion state (after operation completes) */
	clear: () => void;
}

export interface UseBulkDeleteStateReturn {
	/** Current state */
	state: BulkDeleteState;
	/** Actions to modify state */
	actions: BulkDeleteActions;
}

/**
 * Hook to manage bulk delete operation state.
 * Eliminates ~60 lines of boilerplate per CRUD page.
 *
 * @returns Object with state and actions for bulk delete operations
 */
export function useBulkDeleteState(): UseBulkDeleteStateReturn {
	const [showDialog, setShowDialog] = useState(false);
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [isRefreshingAfterMutation, setIsRefreshingAfterMutation] = useState(false);
	const [isMutating, setIsMutating] = useState(false);

	const actions: BulkDeleteActions = {
		openDialog: () => setShowDialog(true),
		closeDialog: () => setShowDialog(false),
		setShowDialog,
		startDeleting: (ids: Set<string>) => {
			setDeletingIds(ids);
			setIsBulkDeleting(true);
			setIsRefreshingAfterMutation(true);
			setIsMutating(true);
		},
		setDeletingIds,
		setIsBulkDeleting,
		setIsRefreshingAfterMutation,
		markMutating: () => {
			setIsRefreshingAfterMutation(true);
			setIsMutating(true);
		},
		clear: () => {
			setDeletingIds(new Set());
			setIsBulkDeleting(false);
			setIsRefreshingAfterMutation(false);
			setIsMutating(false);
		},
	};

	return {
		state: {
			showDialog,
			deletingIds,
			isBulkDeleting,
			isRefreshingAfterMutation,
			isMutating,
		},
		actions,
	};
}
