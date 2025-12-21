import { ReactNode } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

/**
 * ===========================================================================================
 * BULK ACTION BAR - Generic UI Component
 * ===========================================================================================
 *
 * Floating action bar for bulk operations.
 * - Uses CVA for variant management (Radix Nova style)
 * - Uses theme colors for dark/light variants
 * - Uses shadcn Button component
 *
 * ===========================================================================================
 */

const bulkActionBarVariants = cva(
	`
   fixed bottom-5 z-40 flex animate-[slide-up_0.2s_ease-out] items-center gap-4
   rounded-lg px-6 py-3 shadow-xl
 `,
	{
		variants: {
			variant: {
				dark: 'bg-foreground text-background',
				light: 'border border-border bg-background text-foreground',
			},
			position: {
				centered: 'left-1/2 -translate-x-1/2',
				right: 'right-5',
			},
		},
		defaultVariants: {
			variant: 'dark',
			position: 'centered',
		},
	}
);

export interface BulkActionBarProps extends VariantProps<typeof bulkActionBarVariants> {
	selectionCount: number;
	selectedLabel?: string;
	onCancel: () => void;
	children: ReactNode;
}

export function BulkActionBar({
	selectionCount,
	selectedLabel,
	onCancel,
	variant = 'dark',
	position = 'centered',
	children,
}: BulkActionBarProps) {
	const displayLabel = selectedLabel || `${selectionCount} item(s) selected`;

	return (
		<div className={cn(bulkActionBarVariants({ variant, position }))}>
			<span className="font-medium">{displayLabel}</span>
			<div className="flex items-center gap-2">
				{children}
				<Button onClick={onCancel} variant="ghost" size="sm" className="ml-2">
					Cancel
				</Button>
			</div>
		</div>
	);
}
