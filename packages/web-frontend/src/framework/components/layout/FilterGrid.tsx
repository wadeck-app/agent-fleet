import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const filterGridVariants = cva(
	// @formatter:off
	`mb-4 grid gap-4`,
	// @formatter:on
	{
		variants: {
			cols: {
				2: `
      grid-cols-1
      sm:grid-cols-2
    `,
				3: `
      grid-cols-1
      sm:grid-cols-2
      lg:grid-cols-3
    `,
				4: `
      grid-cols-1
      sm:grid-cols-2
      lg:grid-cols-4
    `,
			},
		},
		defaultVariants: {
			cols: 4,
		},
	}
);

export type FilterGridProps = React.ComponentProps<'div'> &
	VariantProps<typeof filterGridVariants> & {
		children: React.ReactNode;
	};

/**
 * FilterGrid - A responsive grid layout for filter components
 *
 * Provides consistent spacing and responsive breakpoints for filter layouts.
 * Automatically stacks to 1 column on mobile, 2 columns on tablets, and
 * the specified number of columns on desktop.
 *
 * @example
 * <FilterGrid cols={4}>
 *   <FilterField label="Status">...</FilterField>
 *   <FilterField label="Priority">...</FilterField>
 * </FilterGrid>
 */
function FilterGrid({ className, cols = 4, children, ...props }: FilterGridProps) {
	return (
		<div className={cn(filterGridVariants({ cols }), className)} {...props}>
			{children}
		</div>
	);
}

export { FilterGrid, filterGridVariants };
