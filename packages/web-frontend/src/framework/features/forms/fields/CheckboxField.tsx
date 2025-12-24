import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Checkbox } from '@framework/components/forms/Checkbox';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * CHECKBOX FIELD - Complete form field component (shadcn Field + Checkbox)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Checkbox component.
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system with horizontal orientation
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 * - Checkbox and label are inline
 *
 * ===========================================================================================
 */

export interface CheckboxFieldProps extends Omit<BaseFieldProps, 'required'> {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	required?: boolean;
}

export function CheckboxField({
	label,
	checked,
	onChange,
	disabled = false,
	required = false,
	error,
	className = '',
	id,
}: CheckboxFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field orientation="horizontal" className={className} data-disabled={disabled}>
			<Checkbox
				id={inputId}
				checked={checked}
				onCheckedChange={onChange}
				disabled={disabled}
				required={required}
			/>
			<FieldLabel htmlFor={inputId} className="cursor-pointer">
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
