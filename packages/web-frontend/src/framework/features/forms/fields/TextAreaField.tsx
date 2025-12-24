import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Textarea } from '@framework/components/forms/Textarea';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * TEXTAREA FIELD - Complete form field component (shadcn Field + Textarea)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Textarea component.
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system internally
 * - Maintains backward-compatible API
 * - Consistent styling with other shadcn components
 *
 * ===========================================================================================
 */

export interface TextAreaFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	rows?: number;
}

export function TextAreaField({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	rows = 4,
	error,
	className = '',
	id,
}: TextAreaFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<Textarea
				id={inputId}
				value={value}
				onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
				placeholder={placeholder}
				required={required}
				disabled={disabled}
				rows={rows}
				aria-invalid={!!error}
			/>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
