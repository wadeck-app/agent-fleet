import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const tabButtonVariants = cva(
	// @formatter:off
	`
   group relative flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3
   transition-colors
   hover:bg-accent/50
   focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
   focus-visible:outline-none
   disabled:pointer-events-none disabled:opacity-50
 `,
	// @formatter:on
	{
		variants: {
			active: {
				// @formatter:off
				true: `border-primary bg-accent/30 text-foreground`,
				false: `
      border-transparent text-muted-foreground
      hover:text-foreground
    `,
				// @formatter:on
			},
		},
		defaultVariants: {
			active: false,
		},
	}
);

export type TabButtonProps = React.ComponentProps<'button'> &
	VariantProps<typeof tabButtonVariants> & {
		icon?: React.ReactNode;
		badge?: React.ReactNode;
		action?: React.ReactNode;
	};

/**
 * TabButton - A styled button for navigation tabs
 *
 * Provides consistent styling for tab navigation with active/inactive states.
 * Supports optional icon, badge, and action elements.
 *
 * @example
 * <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
 *   Overview
 * </TabButton>
 *
 * @example
 * <TabButton
 *   active={activeTab === 'settings'}
 *   icon={<Settings className="size-4" />}
 *   badge={<Badge>3</Badge>}
 *   action={<Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEdit(); }}><Edit /></Button>}
 *   onClick={() => setActiveTab('settings')}
 * >
 *   Settings
 * </TabButton>
 */
function TabButton({ className, active = false, icon, badge, action, children, ...props }: TabButtonProps) {
	const Comp = 'button';

	return (
		<Comp className={cn(tabButtonVariants({ active }), className)} {...props}>
			{icon}
			{children}
			{badge}
			{action}
		</Comp>
	);
}

export { TabButton, tabButtonVariants };
