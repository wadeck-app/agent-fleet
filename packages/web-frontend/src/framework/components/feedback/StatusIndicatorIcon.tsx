import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Eye,
	GitMerge,
	type LucideIcon,
	UserCheck,
	UserX,
	XCircle,
} from 'lucide-react';

const statusIndicatorVariants = cva(
	// @formatter:off
	`shrink-0`,
	// @formatter:on
	{
		variants: {
			status: {
				success: `
      text-green-600
      dark:text-green-400
    `,
				error: `
      text-red-600
      dark:text-red-400
    `,
				warning: `
      text-yellow-600
      dark:text-yellow-400
    `,
				info: `
      text-blue-600
      dark:text-blue-400
    `,
				purple: `
      text-purple-600
      dark:text-purple-400
    `,
				// @formatter:off
				muted: `text-muted-foreground`,
				// @formatter:on
			},
			size: {
				sm: 'size-3',
				md: 'size-4',
				lg: 'size-5',
				xl: 'size-6',
			},
		},
		defaultVariants: {
			status: 'muted',
			size: 'md',
		},
	}
);

export type StatusIndicatorIconProps = VariantProps<typeof statusIndicatorVariants> & {
	icon?: LucideIcon;
	className?: string;
};

/**
 * StatusIndicatorIcon - A reusable status indicator icon component
 *
 * Maps status variants to appropriate colors with dark mode support.
 * Can be used with any Lucide icon or defaults to AlertCircle.
 *
 * @example
 * <StatusIndicatorIcon status="success" icon={CheckCircle2} />
 * <StatusIndicatorIcon status="error" icon={XCircle} size="lg" />
 */
function StatusIndicatorIcon({ status = 'muted', size = 'md', icon, className }: StatusIndicatorIconProps) {
	const Icon = icon || AlertCircle;

	return <Icon className={cn(statusIndicatorVariants({ status, size }), className)} />;
}

export { StatusIndicatorIcon, statusIndicatorVariants };

// Common icon mappings for convenience
export const StatusIcons = {
	checkCircle: CheckCircle2,
	xCircle: XCircle,
	alertCircle: AlertCircle,
	activity: Activity,
	eye: Eye,
	gitMerge: GitMerge,
	userCheck: UserCheck,
	userX: UserX,
} as const;
