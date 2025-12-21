'use client';

import * as React from 'react';

import { cn } from '@framework/lib/utils';

export function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="input-group"
			role="group"
			className={cn(
				`
      group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg
      border border-input transition-colors outline-none
      has-disabled:bg-input/50 has-disabled:opacity-50
      has-[[data-slot=input-group-control]:focus-visible]:border-ring
      has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]
      has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50
      has-[[data-slot][aria-invalid=true]]:border-destructive
      has-[[data-slot][aria-invalid=true]]:ring-[3px]
      has-[[data-slot][aria-invalid=true]]:ring-destructive/20
      has-[>[data-align=block-end]]:h-auto
      has-[>[data-align=block-end]]:flex-col
      has-[>[data-align=block-start]]:h-auto
      has-[>[data-align=block-start]]:flex-col
      has-[>textarea]:h-auto
      dark:bg-input/30 dark:has-disabled:bg-input/80
      dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40
      has-[>[data-align=block-end]]:[&>input]:pt-3
      has-[>[data-align=block-start]]:[&>input]:pb-3
      has-[>[data-align=inline-end]]:[&>input]:pr-1.5
      has-[>[data-align=inline-start]]:[&>input]:pl-1.5
      [[data-slot=combobox-content]_&]:focus-within:border-inherit
      [[data-slot=combobox-content]_&]:focus-within:ring-0
    `,
				className
			)}
			{...props}
		/>
	);
}
