import { Button } from '@framework/components/primitives/Button';
import { AlertCircle, X } from 'lucide-react';

/**
 * ===========================================================================================
 * ERROR ALERT - Generic UI Component
 * ===========================================================================================
 *
 * Pure presentation component for displaying errors.
 * - Zero business logic
 * - Uses lucide-react icons (Radix Nova style)
 * - Dismissible with callback
 *
 * ===========================================================================================
 */

export interface ErrorAlertProps {
	message: string;
	onDismiss?: () => void;
	className?: string;
}

export function ErrorAlert({ message, onDismiss, className = '' }: ErrorAlertProps) {
	return (
		<div
			className={`
     rounded-md border border-destructive/50 bg-destructive/10 p-4
     ${className}
   `}
			role="alert"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<AlertCircle className="size-5 shrink-0 text-destructive" />
					<p className="text-sm font-medium text-destructive">{message}</p>
				</div>
				{onDismiss && (
					<Button
						variant="ghost"
						size="icon"
						onClick={onDismiss}
						className={`
        size-6 shrink-0 text-destructive
        hover:bg-transparent hover:text-destructive/80
      `}
						aria-label="Dismiss error"
					>
						<X className="size-5" />
					</Button>
				)}
			</div>
		</div>
	);
}
