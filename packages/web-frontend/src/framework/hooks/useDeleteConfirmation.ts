import { useState } from 'react';

/**
 * ===========================================================================================
 * USE DELETE CONFIRMATION - Centralized State Management for Delete Confirmation Dialogs
 * ===========================================================================================
 *
 * Eliminates boilerplate state management repeated across 6+ CRUD pages.
 * Manages state and actions for single-item delete confirmation dialogs.
 *
 * **Before (repeated in every CRUD page):**
 * ```typescript
 * const [deleteConfirmation, setDeleteConfirmation] = useState<{
 *   open: boolean;
 *   itemId: string | null;
 * }>({ open: false, itemId: null });
 *
 * const handleDelete = (id: string) => {
 *   setDeleteConfirmation({ open: true, itemId: id });
 * };
 *
 * const handleDeleteConfirm = async () => {
 *   if (deleteConfirmation.itemId) {
 *     await deleteItem(deleteConfirmation.itemId);
 *   }
 *   setDeleteConfirmation({ open: false, itemId: null });
 * };
 * ```
 *
 * **After (one hook call):**
 * ```typescript
 * const deleteConfirmation = useDeleteConfirmation({
 *   onConfirm: async (id) => {
 *     await deleteItem(id);
 *   }
 * });
 *
 * // In component:
 * <Button onClick={() => deleteConfirmation.open(itemId)}>Delete</Button>
 *
 * <AlertDialogWrapper
 *   open={deleteConfirmation.isOpen}
 *   onOpenChange={deleteConfirmation.setOpen}
 *   onConfirm={deleteConfirmation.confirm}
 * />
 * ```
 *
 * **Features:**
 * - Dialog open/closed state
 * - Item ID tracking
 * - Integrated confirmation callback
 * - Automatic cleanup after confirmation
 *
 * ===========================================================================================
 */

export interface UseDeleteConfirmationOptions {
	/**
	 * Callback invoked when user confirms deletion.
	 * Receives the item ID that was passed to open().
	 */
	onConfirm?: (itemId: string) => Promise<void> | void;
}

export interface DeleteConfirmationState {
	/** Whether the confirmation dialog is open */
	isOpen: boolean;
	/** ID of the item to be deleted (null if dialog is closed) */
	itemId: string | null;
}

export interface DeleteConfirmationActions {
	/**
	 * Open the delete confirmation dialog for a specific item.
	 * @param id - ID of the item to delete
	 */
	open: (id: string) => void;
	/**
	 * Close the delete confirmation dialog without deleting.
	 */
	close: () => void;
	/**
	 * Set the dialog open/closed state.
	 * Used for AlertDialogWrapper's onOpenChange prop.
	 */
	setOpen: (open: boolean) => void;
	/**
	 * Confirm and execute the deletion.
	 * Calls onConfirm callback if provided, then closes dialog.
	 */
	confirm: () => Promise<void>;
}

export interface UseDeleteConfirmationReturn extends DeleteConfirmationState, DeleteConfirmationActions {}

/**
 * Hook to manage delete confirmation dialog state.
 * Eliminates ~30 lines of boilerplate per CRUD page.
 *
 * @param options - Configuration options
 * @returns Object with state properties and action methods
 */
export function useDeleteConfirmation(options: UseDeleteConfirmationOptions = {}): UseDeleteConfirmationReturn {
	const [state, setState] = useState<DeleteConfirmationState>({
		isOpen: false,
		itemId: null,
	});

	const open = (id: string) => {
		setState({ isOpen: true, itemId: id });
	};

	const close = () => {
		setState({ isOpen: false, itemId: null });
	};

	const setOpen = (isOpen: boolean) => {
		if (!isOpen) {
			close();
		}
	};

	const confirm = async () => {
		if (state.itemId && options.onConfirm) {
			await options.onConfirm(state.itemId);
		}
		close();
	};

	return {
		// State
		isOpen: state.isOpen,
		itemId: state.itemId,
		// Actions
		open,
		close,
		setOpen,
		confirm,
	};
}
