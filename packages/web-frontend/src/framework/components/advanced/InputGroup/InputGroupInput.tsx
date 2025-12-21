import * as React from 'react';

import { Input } from '@framework/components/forms/Input';
import { cn } from '@framework/lib/utils';

export function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
	return (
		<Input
			data-slot="input-group-control"
			className={cn(
				`
      flex-1 rounded-none border-0 bg-transparent shadow-none ring-0
      focus-visible:ring-0
      disabled:bg-transparent
      aria-invalid:ring-0
      dark:bg-transparent dark:disabled:bg-transparent
    `,
				className
			)}
			{...props}
		/>
	);
}
