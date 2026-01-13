import React, { useMemo } from 'react';

import type { AlertDialogWrapperProps } from '@framework/components/overlays/AlertDialogWrapper';
import { Trash2 } from 'lucide-react';

import { useDialog } from './useDialog';

/**
 * ===========================================================================================
 * USE DIALOG DELETE CONFIRMATION - Zero-Boilerplate Delete Confirmations
 * ===========================================================================================
 *
 * Preset hook for delete confirmations with auto-generated title/description.
 * Wraps useDialog with delete-specific defaults and provides ready-to-use dialogProps.
 *
 * Key Features:
 * - Auto-generated title: "Delete {itemTypeName}?" or "Delete "{displayName}"?" (personalized)
 * - Auto-generated description: "This action cannot be undone..."
 * - Default icon: Trash2
 * - Default variant: 'danger'
 * - Returns ready-to-spread dialogProps for AlertDialogWrapper
 *
 * Example usage:
 * ```tsx
 * import { useDialogDeleteConfirmation } from '@framework/hooks/useDialogDeleteConfirmation';
 * import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
 *
 * function IngredientsPage() {
 *   const deleteConfirmation = useDialogDeleteConfirmation({
 *     itemTypeName: 'ingredient',
 *     onDelete: async (id) => {
 *       await ingredientsService.delete(id);
 *       refresh();
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <Button onClick={() => deleteConfirmation.open(ingredientId)}>
 *         Delete
 *       </Button>
 *
 *       {/* Just spread the props - everything is pre-configured! *\/}
 *       <AlertDialogWrapper {...deleteConfirmation.dialogProps} />
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link useDialog} for the underlying state management
 * @see {@link AlertDialogWrapper} for the dialog component
 * @see {@link useDialogActionConfirmation} for non-delete confirmations
 *
 * ===========================================================================================
 */

export interface UseDialogDeleteConfirmationOptions<T = string> {
	/**
	 * The type name of the item being deleted (e.g., "ingredient", "task", "worker")
	 * Used to generate the default title and description
	 */
	itemTypeName: string;

	/**
	 * Callback invoked when user confirms deletion
	 * Receives the item to delete (ID or full object)
	 */
	onDelete: (item: T) => void | Promise<void>;

	/**
	 * Optional function to get a display name for the item
	 * If provided, generates personalized title: Delete "{displayName}"?
	 * Otherwise uses generic title: Delete {itemTypeName}?
	 *
	 * @example
	 * getItemDisplayName: (item) => item.name
	 */
	getItemDisplayName?: (item: T) => string;

	/**
	 * Optional custom description
	 * If not provided, uses default: "This action cannot be undone. The {itemTypeName} will be permanently deleted."
	 */
	description?: string;

	/**
	 * Optional variant (danger or warning)
	 * @default 'danger'
	 */
	variant?: 'danger' | 'warning';

	/**
	 * Optional custom icon
	 * @default <Trash2 />
	 */
	icon?: React.ReactNode;
}

export interface UseDialogDeleteConfirmationReturn<T = string> {
	/**
	 * Whether the dialog is currently open
	 */
	isOpen: boolean;

	/**
	 * The item being deleted (ID or full object)
	 */
	item: T | null;

	/**
	 * Opens the delete confirmation dialog for the given item
	 */
	open: (item: T) => void;

	/**
	 * Closes the dialog without deleting
	 */
	close: () => void;

	/**
	 * Confirms the deletion
	 */
	confirm: () => Promise<void>;

	/**
	 * Pre-configured props for AlertDialogWrapper
	 * Spread these directly: <AlertDialogWrapper {...dialogProps} />
	 */
	dialogProps: AlertDialogWrapperProps;
}

/**
 * Hook for delete confirmation dialogs with auto-generated messages
 *
 * @template T - Type of the item to delete (string for ID, object for full item)
 * @param options - Configuration options
 * @returns Delete confirmation dialog state and props
 *
 * @example
 * ```tsx
 * // Basic usage with item ID
 * const deleteConfirmation = useDialogDeleteConfirmation({
 *   itemTypeName: 'ingredient',
 *   onDelete: async (id: string) => {
 *     await ingredientsService.delete(id);
 *   },
 * });
 *
 * // With personalized display name
 * const deleteConfirmation = useDialogDeleteConfirmation({
 *   itemTypeName: 'book',
 *   onDelete: async (book: Book) => {
 *     await booksService.delete(book.id);
 *   },
 *   getItemDisplayName: (book) => book.title,
 * });
 *
 * // With custom description and icon
 * const deleteConfirmation = useDialogDeleteConfirmation({
 *   itemTypeName: 'workspace',
 *   onDelete: async (id) => {
 *     await workspacesService.delete(id);
 *   },
 *   description: 'All data in this workspace will be permanently deleted.',
 *   variant: 'warning',
 * });
 * ```
 */
export function useDialogDeleteConfirmation<T = string>(
	options: UseDialogDeleteConfirmationOptions<T>
): UseDialogDeleteConfirmationReturn<T> {
	const { itemTypeName, onDelete, getItemDisplayName, description, variant = 'danger', icon = <Trash2 /> } = options;

	const dialog = useDialog<T>({
		onConfirm: (item: T | null) => {
			// Only call onDelete if item is not null
			if (item !== null) {
				return onDelete(item);
			}
		},
	});

	// Generate title dynamically based on whether item has a display name
	const title = useMemo(() => {
		if (!dialog.item) {
			return `Delete ${itemTypeName}?`;
		}

		if (getItemDisplayName) {
			const displayName = getItemDisplayName(dialog.item);
			return `Delete "${displayName}"?`;
		}

		return `Delete ${itemTypeName}?`;
	}, [dialog.item, itemTypeName, getItemDisplayName]);

	// Generate description
	const generatedDescription =
		description ?? `This action cannot be undone. The ${itemTypeName} will be permanently deleted.`;

	const dialogProps: AlertDialogWrapperProps = useMemo(
		() => ({
			...dialog.dialogProps,
			title,
			description: generatedDescription,
			confirmLabel: 'Delete',
			cancelLabel: 'Cancel',
			onConfirm: dialog.confirm,
			onCancel: dialog.cancel,
			variant,
			icon,
		}),
		[dialog.dialogProps, dialog.confirm, dialog.cancel, title, generatedDescription, variant, icon]
	);

	return {
		isOpen: dialog.isOpen,
		item: dialog.item,
		open: dialog.open,
		close: dialog.close,
		confirm: dialog.confirm,
		dialogProps,
	};
}
