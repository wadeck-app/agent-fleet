import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * DATETIME FIELD - Complete form field component (shadcn Field + Input type=datetime-local)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Input (datetime-local type).
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system internally
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 * - Value is ISO datetime string (YYYY-MM-DDTHH:mm)
 *
 * ===========================================================================================
 */

export interface DateTimeFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	min?: string;
	max?: string;
}

export function DateTimeField({
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
	description,
}: DateTimeFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<Input
				id={inputId}
				type="datetime-local"
				value={value}
				onChange={e => onChange(e.target.value)}
				required={required}
				disabled={disabled}
				min={min}
				max={max}
				aria-invalid={!!error}
			/>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
