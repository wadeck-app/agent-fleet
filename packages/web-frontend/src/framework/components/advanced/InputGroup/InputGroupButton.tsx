import * as React from 'react';

import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

export const inputGroupButtonVariants = cva(`flex items-center gap-2 text-sm shadow-none`, {
	variants: {
		size: {
			xs: `
      h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5
      [&>svg:not([class*='size-'])]:size-3.5
    `,
			sm: '',
			'icon-xs': `
      size-6 rounded-[calc(var(--radius)-3px)] p-0
      has-[>svg]:p-0
    `,
			'icon-sm': `
      size-8 p-0
      has-[>svg]:p-0
    `,
		},
	},
	defaultVariants: {
		size: 'xs',
	},
});

export function InputGroupButton({
	className,
	type = 'button',
	variant = 'ghost',
	size = 'xs',
	...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> & VariantProps<typeof inputGroupButtonVariants>) {
	return (
		<Button
			type={type}
			data-size={size}
			variant={variant}
			className={cn(inputGroupButtonVariants({ size }), className)}
			{...props}
		/>
	);
}
