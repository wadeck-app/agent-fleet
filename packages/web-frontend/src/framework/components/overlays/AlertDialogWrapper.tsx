import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
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

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
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
