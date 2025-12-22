import { cn } from '@framework/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

export const fieldVariants = cva(
	`
   group/field flex w-full gap-2
   data-[invalid=true]:text-destructive
 `,
	{
		variants: {
			orientation: {
				vertical: `
      flex-col
      [&>*]:w-full
      [&>.sr-only]:w-auto
    `,
				horizontal: `
      flex-row items-center
      has-[>[data-slot=field-content]]:items-start
      [&>[data-slot=field-label]]:flex-auto
      has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px
    `,
				responsive: `
      flex-col
      @md/field-group:flex-row @md/field-group:items-center
      @md/field-group:has-[>[data-slot=field-content]]:items-start
      [&>*]:w-full
      @md/field-group:[&>*]:w-auto
      [&>.sr-only]:w-auto
      @md/field-group:[&>[data-slot=field-label]]:flex-auto
      @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px
    `,
			},
		},
		defaultVariants: {
			orientation: 'vertical',
		},
	}
);

export function Field({
	className,
	orientation = 'vertical',
	...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
	return (
		<div
			role="group"
			data-slot="field"
			data-orientation={orientation}
			className={cn(fieldVariants({ orientation }), className)}
			{...props}
		/>
	);
}

export type { VariantProps };
