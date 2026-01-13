import { useMemo } from 'react';

import type { AlertDialogWrapperProps } from '@framework/components/overlays/AlertDialogWrapper';

import { useDialog } from './useDialog';

/**
 * ===========================================================================================
 * USE DIALOG ACTION CONFIRMATION - Flexible Action Confirmation Hook
 * ===========================================================================================
 *
 * Preset hook for custom action confirmations with full control over messaging.
 * Wraps useDialog with configurable options and provides ready-to-use dialogProps.
 *
 * Key Features:
 * - Full control over title, description, and labels
 * - Configurable variant (danger, warning, info)
 * - Optional icon support
 * - Optional size control
 * - Returns ready-to-spread dialogProps for AlertDialogWrapper
 *
 * Use Cases:
 * - Reset/Clear operations
 * - Publish/Deploy actions
 * - Archive operations
 * - Any non-delete confirmation that needs custom messaging
 *
 * Example usage:
 * ```tsx
 * import { AlertTriangle } from 'lucide-react';
 * import { useDialogActionConfirmation } from '@framework/hooks/useDialogActionConfirmation';
 * import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
 *
 * function FlowEditor() {
 *   const resetConfirmation = useDialogActionConfirmation({
 *     title: 'Reset Flow?',
 *     description: 'All unsaved changes will be lost. This action cannot be undone.',
 *     confirmLabel: 'Reset',
 *     variant: 'warning',
 *     icon: <AlertTriangle />,
 *     onConfirm: () => {
 *       resetFlow();
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <Button onClick={() => resetConfirmation.open()}>
 *         Reset Flow
 *       </Button>
 *
 *       <AlertDialogWrapper {...resetConfirmation.dialogProps} />
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link useDialog} for the underlying state management
 * @see {@link AlertDialogWrapper} for the dialog component
 * @see {@link useDialogDeleteConfirmation} for delete confirmation preset
 *
 * ===========================================================================================
 */

export interface UseDialogActionConfirmationOptions<T = void> {
	/**
	 * Dialog title
	 */
	title: string;

	/**
	 * Dialog description
	 */
	description: string;

	/**
	 * Callback invoked when user confirms the action
	 * Can optionally receive a context item
	 */
	onConfirm: (context?: T) => void | Promise<void>;

	/**
	 * Optional callback invoked when user cancels
	 */
	onCancel?: () => void;

	/**
	 * Optional confirm button label
	 * @default 'Confirm'
	 */
	confirmLabel?: string;

	/**
	 * Optional cancel button label
	 * @default 'Cancel'
	 */
	cancelLabel?: string;

	/**
	 * Optional variant
	 * @default 'info'
	 */
	variant?: 'danger' | 'warning' | 'info';

	/**
	 * Optional icon
	 */
	icon?: React.ReactNode;

	/**
	 * Optional dialog size
	 * @default 'default'
	 */
	size?: 'default' | 'sm';
}

export interface UseDialogActionConfirmationReturn<T = void> {
	/**
	 * Whether the dialog is currently open
	 */
	isOpen: boolean;

	/**
	 * The context item (if provided when opening)
	 */
	context: T | null;

	/**
	 * Opens the confirmation dialog, optionally with context
	 */
	open: (context?: T) => void;

	/**
	 * Closes the dialog without performing the action
	 */
	close: () => void;

	/**
	 * Confirms the action
	 */
	confirm: () => Promise<void>;

	/**
	 * Pre-configured props for AlertDialogWrapper
	 * Spread these directly: <AlertDialogWrapper {...dialogProps} />
	 */
	dialogProps: AlertDialogWrapperProps;
}

/**
 * Hook for custom action confirmation dialogs
 *
 * @template T - Type of the context item (use void for no context)
 * @param options - Configuration options
 * @returns Action confirmation dialog state and props
 *
 * @example
 * ```tsx
 * // Simple confirmation without context
 * const publishConfirmation = useDialogActionConfirmation({
 *   title: 'Publish Changes?',
 *   description: 'Your changes will be visible to all users.',
 *   confirmLabel: 'Publish',
 *   variant: 'info',
 *   onConfirm: async () => {
 *     await publishChanges();
 *   },
 * });
 *
 * // With context (e.g., item to archive)
 * const archiveConfirmation = useDialogActionConfirmation<Task>({
 *   title: 'Archive Task?',
 *   description: 'Archived tasks can be restored later.',
 *   confirmLabel: 'Archive',
 *   variant: 'warning',
 *   onConfirm: async (task) => {
 *     await archiveTask(task.id);
 *   },
 * });
 *
 * // With custom icon and size
 * const deployConfirmation = useDialogActionConfirmation({
 *   title: 'Deploy to Production?',
 *   description: 'This will deploy your code to the production environment.',
 *   confirmLabel: 'Deploy',
 *   variant: 'warning',
 *   icon: <Rocket />,
 *   size: 'sm',
 *   onConfirm: async () => {
 *     await deployToProduction();
 *   },
 * });
 * ```
 */
export function useDialogActionConfirmation<T = void>(
	options: UseDialogActionConfirmationOptions<T>
): UseDialogActionConfirmationReturn<T> {
	const {
		title,
		description,
		onConfirm,
		onCancel,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'info',
		icon,
		size = 'default',
	} = options;

	const dialog = useDialog<T>({
		onConfirm: (item: T | null) => {
			// Convert null to undefined for the callback signature
			return onConfirm(item ?? undefined);
		},
		onCancel,
	});

	const dialogProps: AlertDialogWrapperProps = useMemo(
		() => ({
			...dialog.dialogProps,
			title,
			description,
			confirmLabel,
			cancelLabel,
			onConfirm: dialog.confirm,
			onCancel: dialog.cancel,
			variant,
			icon,
			size,
		}),
		[
			dialog.dialogProps,
			dialog.confirm,
			dialog.cancel,
			title,
			description,
			confirmLabel,
			cancelLabel,
			variant,
			icon,
			size,
		]
	);

	return {
		isOpen: dialog.isOpen,
		context: dialog.item,
		open: dialog.open,
		close: dialog.close,
		confirm: dialog.confirm,
		dialogProps,
	};
}
