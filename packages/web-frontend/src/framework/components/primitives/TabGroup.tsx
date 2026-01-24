import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const tabGroupVariants = cva(
	// @formatter:off
	`
   border-b border-border
 `,
	// @formatter:on
	{
		variants: {
			variant: {
				default: 'bg-muted/30',
				card: 'bg-card',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

const tabGroupWrapperVariants = cva(
	// @formatter:off
	`
   flex items-center justify-between px-4
 `
	// @formatter:on
);

const tabGroupContentVariants = cva(
	// @formatter:off
	`
   flex items-center overflow-x-auto
 `,
	// @formatter:on
	{
		variants: {
			hasTitle: {
				true: 'gap-4',
				false: 'gap-1',
			},
		},
		defaultVariants: {
			hasTitle: false,
		},
	}
);

const tabGroupTabsVariants = cva(
	// @formatter:off
	`
   flex items-center gap-1
 `
	// @formatter:on
);

const tabGroupTitleVariants = cva(
	// @formatter:off
	`
   text-sm font-medium text-muted-foreground
 `
	// @formatter:on
);

export type TabGroupProps = React.ComponentProps<'div'> &
	VariantProps<typeof tabGroupVariants> & {
		/**
		 * Optional title to display before the tabs
		 */
		title?: React.ReactNode;
		/**
		 * Actions to display at the end (e.g., manage button)
		 */
		actions?: React.ReactNode;
	};

/**
 * TabGroup - A styled container for tab navigation
 *
 * Encapsulates the 3-div structure with all styling for consistent tab layouts.
 * Provides a variant system for different background styles (default vs card).
 *
 * Features:
 * - CVA-based variant system (default, card)
 * - Optional title display before tabs
 * - Optional actions area (e.g., manage buttons)
 * - Overflow handling for many tabs
 * - Consistent spacing and borders
 *
 * Architecture:
 * - Tier 1 Primitive: Maximum CSS (50+ classes via CVA)
 * - Zero business logic, pure presentation
 * - Follows Button.tsx CVA pattern
 *
 * @example
 * <TabGroup variant="default">
 *   <TabButton active={true}>Tab 1</TabButton>
 *   <TabButton>Tab 2</TabButton>
 * </TabGroup>
 *
 * @example
 * <TabGroup
 *   variant="card"
 *   title="Projects v2"
 *   actions={<Button size="sm">Manage</Button>}
 * >
 *   <TabButton icon={<Icon />} badge={<Badge>3</Badge>}>
 *     Project 1
 *   </TabButton>
 * </TabGroup>
 */
function TabGroup({ className, variant = 'default', title, actions, children, ...props }: TabGroupProps) {
	return (
		<div className={cn(tabGroupVariants({ variant }), className)} {...props}>
			<div className={tabGroupWrapperVariants()}>
				<div className={tabGroupContentVariants({ hasTitle: !!title })}>
					{title && <span className={tabGroupTitleVariants()}>{title}</span>}
					<div className={tabGroupTabsVariants()}>{children}</div>
				</div>
				{actions && <div>{actions}</div>}
			</div>
		</div>
	);
}

export { TabGroup, tabGroupVariants };
