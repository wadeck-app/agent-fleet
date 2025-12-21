import { Label } from '@framework/components/forms/Label';
import { cn } from '@framework/lib/utils';

export function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
	return (
		<Label
			data-slot="field-label"
			className={cn(
				`
      group/field-label peer/field-label flex w-fit gap-2 leading-snug
      group-data-[disabled=true]/field:opacity-50
      has-data-checked:border-primary has-data-checked:bg-primary/5
      has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border
      dark:has-data-checked:bg-primary/10
      [&>*]:data-[slot=field]:p-2.5
    `,
				'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col',
				className
			)}
			{...props}
		/>
	);
}
