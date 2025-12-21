import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';

import { BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * NUMBER FIELD - Complete form field component (shadcn Field + Input type=number)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Input (number type).
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system internally
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 * - For integers, consider using IntegerField convenience wrapper
 *
 * ===========================================================================================
 */

export interface NumberFieldProps extends BaseFieldProps {
	value: number;
	onChange: (value: number) => void;
	placeholder?: string;
	disabled?: boolean;
	step?: number;
	min?: number;
	max?: number;
}

export function NumberField({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	step,
	min,
	max,
	error,
	className = '',
	id,
}: NumberFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<Input
				id={inputId}
				type="number"
				value={value}
				onChange={e => onChange(parseFloat(e.target.value) || 0)}
				placeholder={placeholder}
				required={required}
				disabled={disabled}
				step={step}
				min={min}
				max={max}
				aria-invalid={!!error}
			/>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
