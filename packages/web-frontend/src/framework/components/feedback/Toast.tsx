import { useEffect, useRef } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { recordToastEvent } from '@framework/features/toast/toastEventStore';
import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import { X } from 'lucide-react';

/**
 * ===========================================================================================
 * TOAST - Generic UI Component
 * ===========================================================================================
 *
 * Toast notification component.
 * - Uses CVA for variant management (Radix Nova style)
 * - Uses theme colors consistently (no hardcoded colors)
 * - Auto-dismisses except for errors
 *
 * ===========================================================================================
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps extends VariantProps<typeof toastVariants> {
	message: string;
	type?: ToastType;
	duration?: number;
	onClose: () => void;
}

const toastVariants = cva(
	`
   pointer-events-auto max-w-[500px] min-w-[300px]
   animate-[toast-slide-in_0.3s_ease-out] rounded-lg px-6 py-4 shadow-lg
 `,
	{
		variants: {
			type: {
				success: 'bg-green-600 text-white dark:bg-green-700',
				error: 'bg-destructive text-destructive-foreground',
				info: 'bg-secondary text-secondary-foreground',
				warning: 'bg-accent text-accent-foreground',
			},
		},
		defaultVariants: {
			type: 'success',
		},
	}
);

export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
	// Use a ref to avoid recreating the timer on each onClose change
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	// Record toast event for E2E tests
	useEffect(() => {
		recordToastEvent(type, message);
	}, [type, message]);

	useEffect(() => {
		// Error toasts stay displayed until manual click
		if (type === 'error') {
			return;
		}

		const timer = setTimeout(() => {
			onCloseRef.current();
		}, duration);

		return () => clearTimeout(timer);
	}, [duration, type]);

	return (
		<div className={cn(toastVariants({ type }))}>
			<div className="flex items-center justify-between gap-4">
				<span className="text-sm font-medium">{message}</span>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label="Close toast"
					className={`
       size-6
       hover:bg-transparent hover:opacity-70
     `}
				>
					<X className="size-4" />
				</Button>
			</div>
		</div>
	);
}
