import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const skeletonBoxVariants = cva(
	// @formatter:off
	`animate-pulse bg-muted`,
	// @formatter:on
	{
		variants: {
			shape: {
				rect: 'rounded',
				circle: 'rounded-full',
				pill: 'rounded-full',
				line: 'rounded',
				square: 'rounded',
			},
			size: {
				xs: '',
				sm: '',
				md: '',
				lg: '',
				xl: '',
				full: 'w-full',
			},
		},
		defaultVariants: {
			shape: 'rect',
			size: 'md',
		},
	}
);

export type SkeletonBoxProps = React.ComponentProps<'div'> &
	VariantProps<typeof skeletonBoxVariants> & {
		width?: string;
		height?: string;
	};

/**
 * SkeletonBox - A loading skeleton element
 *
 * Provides animated placeholder elements for loading states.
 * Supports different shapes (rect, circle, pill, line, square) and sizes.
 *
 * @example
 * // Simple rectangle
 * <SkeletonBox className="h-6 w-32" />
 *
 * // Circle avatar
 * <SkeletonBox shape="circle" className="size-10" />
 *
 * // Full-width line
 * <SkeletonBox shape="line" className="h-4" size="full" />
 *
 * // Badge/pill
 * <SkeletonBox shape="pill" className="h-6 w-20" />
 *
 * // Multiple lines
 * <div className="space-y-3">
 *   <SkeletonBox className="h-4 w-full" />
 *   <SkeletonBox className="h-4 w-5/6" />
 *   <SkeletonBox className="h-4 w-4/5" />
 * </div>
 */
function SkeletonBox({ className, shape = 'rect', size = 'md', ...props }: SkeletonBoxProps) {
	return <div className={cn(skeletonBoxVariants({ shape, size }), className)} {...props} />;
}

export { SkeletonBox, skeletonBoxVariants };
