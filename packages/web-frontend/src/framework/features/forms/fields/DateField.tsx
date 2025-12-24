import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * DATE FIELD - Complete form field component (shadcn Field + Input type=date)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Input (date type).
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system internally
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 * - Value is ISO date string (YYYY-MM-DD)
 *
 * ===========================================================================================
 */

export interface DateFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	min?: string;
	max?: string;
}

export function DateField({
	label,
	value,
	onChange,
	required = false,
	disabled = false,
	min,
	max,
	error,
	className = '',
	id,
}: DateFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<Input
				id={inputId}
				type="date"
				value={value}
				onChange={e => onChange(e.target.value)}
				required={required}
				disabled={disabled}
				min={min}
				max={max}
				aria-invalid={!!error}
			/>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
