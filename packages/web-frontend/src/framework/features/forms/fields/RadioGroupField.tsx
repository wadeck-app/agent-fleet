import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLegend } from '@framework/components/advanced/Field/FieldLegend';
import { FieldSet } from '@framework/components/advanced/Field/FieldSet';
import { RadioGroupWrapper as RadioGroup } from '@framework/components/forms/RadioGroupWrapper';
import { type RadioOption } from '@framework/components/forms/RadioGroupWrapper';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * RADIO GROUP FIELD - Complete radio group form field (shadcn Field + RadioGroup)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with RadioGroup component.
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn FieldSet and FieldLegend (semantic for radio groups)
 * - Maintains backward-compatible API
 * - Mutually exclusive options
 * - Horizontal or vertical layout
 *
 * ===========================================================================================
 */

export type { RadioOption };

export interface RadioGroupFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	options: RadioOption[];
	orientation?: 'horizontal' | 'vertical';
}

export function RadioGroupField({
	label,
	value,
	onChange,
	options,
	orientation = 'vertical',
	required = false,
	error,
	className = '',
	id,
}: RadioGroupFieldProps) {
	const fieldId = generateFieldId(label, id);

	return (
		<FieldSet className={className}>
			<FieldLegend>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLegend>

			<RadioGroup
				id={fieldId}
				value={value}
				onChange={onChange}
				options={options}
				orientation={orientation}
				required={required}
				aria-invalid={!!error}
			/>

			{error && <FieldError>{error}</FieldError>}
		</FieldSet>
	);
}
