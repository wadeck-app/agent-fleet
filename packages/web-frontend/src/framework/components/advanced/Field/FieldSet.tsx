import { cn } from '@framework/lib/utils';

export function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
	return (
		<fieldset
			data-slot="field-set"
			className={cn(
				`
      flex flex-col gap-4
      has-[>[data-slot=checkbox-group]]:gap-3
      has-[>[data-slot=radio-group]]:gap-3
    `,
				className
			)}
			{...props}
		/>
	);
}
