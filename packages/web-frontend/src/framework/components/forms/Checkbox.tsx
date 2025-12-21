import * as React from 'react';

import { cn } from '@framework/lib/utils';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

const Checkbox = React.forwardRef<
	React.ElementRef<typeof CheckboxPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => {
	return (
		<CheckboxPrimitive.Root
			ref={ref}
			data-slot="checkbox"
			className={cn(
				`
      peer relative flex size-4 shrink-0 items-center justify-center
      rounded-[4px] border border-input transition-colors outline-none
      group-has-disabled/field:opacity-50
      after:absolute after:-inset-x-3 after:-inset-y-2
      focus-visible:border-ring focus-visible:ring-[3px]
      focus-visible:ring-ring/50
      disabled:cursor-not-allowed disabled:opacity-50
      aria-invalid:border-destructive aria-invalid:ring-[3px]
      aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary
      data-[state=checked]:border-primary data-[state=checked]:bg-primary
      data-[state=checked]:text-primary-foreground
      data-[state=indeterminate]:border-primary
      data-[state=indeterminate]:bg-primary
      data-[state=indeterminate]:text-primary-foreground
      dark:bg-input/30 dark:aria-invalid:border-destructive/50
      dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary
      dark:data-[state=indeterminate]:bg-primary
    `,
				className
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className={`
      grid place-content-center text-current transition-none
      [&>svg]:size-3.5
    `}
			>
				{props.checked === 'indeterminate' && (
					<div
						className={`
      h-[3px] w-2.5 rounded-full bg-current
    `}
					/>
				)}
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
});

Checkbox.displayName = 'Checkbox';

export { Checkbox };
