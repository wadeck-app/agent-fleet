import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from './AlertDialog';

/**
 * ===========================================================================================
 * ALERT DIALOG WRAPPER - Simplified Alert Dialog
 * ===========================================================================================
 *
 * Wrapper around shadcn Alert Dialog for quick confirmation dialogs.
 * Simplifies the API by accepting props instead of composition.
 *
 * - Modal dialog for critical confirmations
 * - Focus trap (cannot click outside)
 * - Escape key closes dialog
 * - Better accessibility than window.confirm
 * - Customizable title, description, and button labels
 * - Optional icon support with variant-based styling
 * - Configurable dialog size
 *
 * Example usage:
 * ```tsx
 * import { Trash2 } from 'lucide-react';
 * import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
 *
 * function MyComponent() {
 *   const [open, setOpen] = useState(false);
 *
 *   return (
 *     <AlertDialogWrapper
 *       open={open}
 *       onOpenChange={setOpen}
 *       title="Delete Item?"
 *       description="This action cannot be undone."
 *       confirmLabel="Delete"
 *       onConfirm={() => handleDelete()}
 *       variant="danger"
 *       icon={<Trash2 />}
 *     />
 *   );
 * }
 * ```
 *
 * @see {@link useDialog} for state management helper
 * @see {@link useDialogDeleteConfirmation} for delete confirmation preset
 * @see {@link useDialogActionConfirmation} for custom action confirmation preset
 *
 * ===========================================================================================
 */

export interface AlertDialogWrapperProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel?: () => void;
	variant?: 'danger' | 'warning' | 'info';
	icon?: React.ReactNode;
	size?: 'default' | 'sm';
}

export function AlertDialogWrapper({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = 'Confirm',
	cancelLabel = 'Cancel',
	onConfirm,
	onCancel,
	variant = 'danger',
	icon,
	size = 'default',
}: AlertDialogWrapperProps) {
	const handleConfirm = () => {
		onConfirm();
		onOpenChange(false);
	};

	const handleCancel = () => {
		if (onCancel) {
			onCancel();
		}
		onOpenChange(false);
	};

	// Determine icon className based on variant
	const iconClassName =
		variant === 'danger' ? 'text-destructive' : variant === 'warning' ? 'text-warning' : 'text-primary';

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent size={size}>
				<AlertDialogHeader>
					{icon && <AlertDialogMedia className={iconClassName}>{icon}</AlertDialogMedia>}
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={handleCancel}>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction
						variant={variant === 'danger' ? 'destructive' : 'default'}
						onClick={handleConfirm}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
