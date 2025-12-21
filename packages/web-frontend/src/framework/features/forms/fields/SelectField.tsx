import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';

import { BaseFieldProps, generateFieldId } from '../fieldUtils';
import { SelectInput, type SelectOption } from '../inputs/SelectInput';

/**
 * ===========================================================================================
 * SELECT FIELD - Complete form field component (shadcn Field + Select)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Select component.
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system internally
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 *
 * ===========================================================================================
 */

export type { SelectOption };

export interface SelectFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	disabled?: boolean;
}

export function SelectField({
	label,
	value,
	onChange,
	options,
	placeholder,
	required = false,
	disabled = false,
	error,
	className = '',
	id,
}: SelectFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<SelectInput
				id={inputId}
				value={value}
				onChange={onChange}
				options={options}
				placeholder={placeholder}
				required={required}
				disabled={disabled}
			/>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
