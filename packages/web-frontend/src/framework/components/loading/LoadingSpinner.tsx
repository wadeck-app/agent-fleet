import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

/**
 * LoadingSpinner - For small inline loading states
 *
 * Use cases:
 * - Button loading states (e.g., "Saving...")
 * - Small row/cell operations in tables
 * - Inline form field loading
 * - Modal/popup loading states
 * - Small card/section loading
 *
 * For large areas (full pages, tables), use LoadingDots instead.
 *
 * @example
 * <Button disabled={loading}>
 *   {loading ? <LoadingSpinner size="sm" /> : "Save"}
 * </Button>
 */

const spinnerVariants = cva(
	`
  animate-spin rounded-full border-solid border-primary border-t-transparent
`,
	{
		variants: {
			size: {
				sm: 'size-4 border-2',
				md: 'size-8 border-4',
				lg: 'size-12 border-4',
			},
		},
		defaultVariants: {
			size: 'md',
		},
	}
);

const containerVariants = cva('flex flex-col items-center justify-center', {
	variants: {
		size: {
			sm: 'p-2',
			md: 'p-5',
			lg: 'p-8',
		},
	},
	defaultVariants: {
		size: 'md',
	},
});

export interface LoadingSpinnerProps extends VariantProps<typeof spinnerVariants> {
	message?: string;
	className?: string;
}

export function LoadingSpinner({ size = 'md', message = 'Loading...', className }: LoadingSpinnerProps) {
	return (
		<div className={cn(containerVariants({ size }), className)}>
			<div className={spinnerVariants({ size })} role="status" aria-label="Loading" />
			{message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
		</div>
	);
}
