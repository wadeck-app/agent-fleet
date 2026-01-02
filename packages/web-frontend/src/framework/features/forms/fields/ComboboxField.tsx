import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';
import { ComboboxInput, type ComboboxOption } from '../inputs/ComboboxInput';

/**
 * ===========================================================================================
 * COMBOBOX FIELD - Complete form field component (shadcn Field + Combobox)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Combobox component.
 * Provides search/filter functionality for better UX with large option lists.
 *
 * - Uses shadcn Field system internally
 * - Built-in search/filter functionality
 * - Supports disabled options (e.g., for invalid flows)
 * - Consistent styling with other shadcn components
 * - Better alternative to SelectField for large lists
 *
 * Use Cases:
 * - Worker selection (potentially many workers)
 * - Flow selection (potentially many flows)
 * - Any dropdown with > 10 options or that benefits from search
 *
 * ===========================================================================================
 */

export type { ComboboxOption };

export interface ComboboxFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	options: ComboboxOption[];
	placeholder?: string;
	disabled?: boolean;
}

export function ComboboxField({
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
}: ComboboxFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<ComboboxInput
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
