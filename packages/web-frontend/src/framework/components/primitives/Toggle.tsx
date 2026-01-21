import * as React from 'react';

import { cn } from '@framework/lib/utils';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { type VariantProps, cva } from 'class-variance-authority';

const toggleVariants = cva(
	`
   inline-flex cursor-pointer items-center justify-center rounded-md text-sm
   font-medium transition-colors outline-none
   hover:bg-muted hover:text-muted-foreground
   focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
   disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
   data-[state=on]:bg-accent data-[state=on]:text-accent-foreground
 `,
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline: `
      border border-input bg-transparent
      hover:bg-accent hover:text-accent-foreground
    `,
			},
			size: {
				default: 'h-10 px-3',
				sm: 'h-7 gap-1 px-2.5 text-[0.8rem]',
				lg: 'h-11 px-5',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

export type ToggleProps = React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
	VariantProps<typeof toggleVariants>;

const Toggle = React.forwardRef<React.ElementRef<typeof TogglePrimitive.Root>, ToggleProps>(
	({ className, variant, size, ...props }, ref) => (
		<TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />
	)
);

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
