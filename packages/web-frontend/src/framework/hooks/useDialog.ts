import { useCallback, useMemo, useState } from 'react';

/**
 * ===========================================================================================
 * USE DIALOG - Generic Dialog State Management Hook
 * ===========================================================================================
 *
 * Provides standardized state management for alert dialogs with optional context item support.
 * Eliminates repetitive dialog state management code and provides a clean, reusable API.
 *
 * Key Features:
 * - Generic context item support (string ID, full object, etc.)
 * - Async onConfirm callback handling
 * - Auto-close after confirmation (configurable)
 * - Convenience `dialogProps` getter for easy integration with AlertDialogWrapper
 *
 * Example usage:
 * ```tsx
 * import { useDialog } from '@framework/hooks/useDialog';
 * import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
 *
 * function MyComponent() {
 *   const dialog = useDialog<string>({
 *     onConfirm: async (itemId) => {
 *       await deleteItem(itemId);
 *       refresh();
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <Button onClick={() => dialog.open(itemId)}>Delete</Button>
 *
 *       <AlertDialogWrapper
 *         {...dialog.dialogProps}
 *         title="Delete Item?"
 *         description="This action cannot be undone."
 *         onConfirm={dialog.confirm}
 *       />
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link AlertDialogWrapper} for the dialog component
 * @see {@link useDialogDeleteConfirmation} for delete confirmation preset
 * @see {@link useDialogActionConfirmation} for custom action confirmation preset
 *
 * ===========================================================================================
 */

export interface UseDialogOptions<T = string> {
	/**
	 * Callback invoked when user confirms the dialog
	 * Receives the context item (if provided when opening)
	 * Can be async for API calls, etc.
	 */
	onConfirm?: (item: T | null) => void | Promise<void>;

	/**
	 * Callback invoked when user cancels the dialog
	 */
	onCancel?: () => void;

	/**
	 * Whether to automatically close the dialog after confirmation
	 * @default true
	 */
	autoClose?: boolean;
}

export interface UseDialogReturn<T = string> {
	/**
	 * Whether the dialog is currently open
	 */
	isOpen: boolean;

	/**
	 * The context item associated with the dialog (e.g., item ID to delete)
	 * Null if dialog opened without context or if closed
	 */
	item: T | null;

	/**
	 * Opens the dialog, optionally with a context item
	 * @param contextItem - Optional item to associate with this dialog instance
	 */
	open: (contextItem?: T) => void;

	/**
	 * Closes the dialog and clears the context item
	 */
	close: () => void;

	/**
	 * Confirms the action:
	 * 1. Calls onConfirm callback with the context item
	 * 2. Auto-closes the dialog (unless autoClose is false)
	 */
	confirm: () => Promise<void>;

	/**
	 * Cancels the action:
	 * 1. Calls onCancel callback (if provided)
	 * 2. Closes the dialog
	 */
	cancel: () => void;

	/**
	 * Convenience props for AlertDialogWrapper integration
	 * Spread these props directly: <AlertDialogWrapper {...dialog.dialogProps} />
	 */
	dialogProps: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};
}

/**
 * Hook for managing alert dialog state with optional context item
 *
 * @template T - Type of the context item (e.g., string for ID, object for full item)
 * @param options - Configuration options for the dialog
 * @returns Dialog state and actions
 *
 * @example
 * ```tsx
 * // Simple confirmation without context
 * const dialog = useDialog({
 *   onConfirm: () => handleAction(),
 * });
 *
 * // With context item (e.g., item ID)
 * const dialog = useDialog<string>({
 *   onConfirm: async (id) => {
 *     await deleteItem(id);
 *   },
 * });
 *
 * // With full item object
 * const dialog = useDialog<User>({
 *   onConfirm: async (user) => {
 *     await deleteUser(user.id);
 *   },
 * });
 *
 * // Without auto-close (keep dialog open after confirm)
 * const dialog = useDialog({
 *   onConfirm: async () => {
 *     await performAction();
 *   },
 *   autoClose: false,
 * });
 * ```
 */
export function useDialog<T = string>(options?: UseDialogOptions<T>): UseDialogReturn<T> {
	const [isOpen, setIsOpen] = useState(false);
	const [item, setItem] = useState<T | null>(null);

	// Extract options properties to satisfy ESLint hook dependencies rule
	const { onConfirm, onCancel, autoClose = true } = options ?? {};

	const open = useCallback((contextItem?: T) => {
		setItem(contextItem ?? null);
		setIsOpen(true);
	}, []);

	const close = useCallback(() => {
		setIsOpen(false);
		setItem(null);
	}, []);

	const confirm = useCallback(async () => {
		if (onConfirm) {
			await onConfirm(item);
		}
		if (autoClose) {
			close();
		}
	}, [item, onConfirm, autoClose, close]);

	const cancel = useCallback(() => {
		onCancel?.();
		close();
	}, [onCancel, close]);

	const dialogProps = useMemo(
		() => ({
			open: isOpen,
			onOpenChange: (open: boolean) => {
				if (!open) {
					close();
				}
			},
		}),
		[isOpen, close]
	);

	return {
		isOpen,
		item,
		open,
		close,
		confirm,
		cancel,
		dialogProps,
	};
}
