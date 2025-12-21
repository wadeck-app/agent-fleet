import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';

import { BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * TEXT FIELD - Complete form field component (shadcn Field + Input)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Input component.
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system internally
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 *
 * ===========================================================================================
 */

export interface TextFieldProps extends BaseFieldProps {
	type?: 'text' | 'email' | 'password' | 'tel' | 'url';
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export function TextField({
	label,
	type = 'text',
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	error,
	className = '',
	id,
}: TextFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<Input
				id={inputId}
				type={type}
				value={value}
				onChange={e => onChange(e.target.value)}
				placeholder={placeholder}
				required={required}
				disabled={disabled}
				aria-invalid={!!error}
			/>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
