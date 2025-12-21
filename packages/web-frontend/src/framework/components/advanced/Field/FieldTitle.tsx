import { cn } from '@framework/lib/utils';

export function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="field-label"
			className={cn(
				`
      flex w-fit items-center gap-2 text-sm leading-snug font-medium
      group-data-[disabled=true]/field:opacity-50
    `,
				className
			)}
			{...props}
		/>
	);
}
