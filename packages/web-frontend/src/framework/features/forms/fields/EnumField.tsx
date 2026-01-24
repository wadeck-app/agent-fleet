import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';
import { SelectInput, type SelectOption } from '../inputs/SelectInput';

/**
 * ===========================================================================================
 * ENUM FIELD - Single select dropdown for enum types
 * ===========================================================================================
 *
 * Specialized field component for enum type inputs with single selection.
 *
 * - Select dropdown using Radix Select
 * - Read options from inputDef.options.options
 * - Optional searchable mode
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface EnumOption {
	value: string;
	label: string;
}

export interface EnumFieldOptions {
	options: EnumOption[];
	searchable?: boolean;
}

export interface EnumFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	options?: EnumFieldOptions;
	placeholder?: string;
	disabled?: boolean;
}

export function EnumField({
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
	description,
}: EnumFieldProps) {
	const inputId = generateFieldId(label, id);

	// Convert EnumOption[] to SelectOption[]
	const selectOptions: SelectOption[] =
		options?.options?.map(opt => ({
			value: opt.value,
			label: opt.label,
		})) || [];

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
				options={selectOptions}
				placeholder={placeholder || 'Select an option...'}
				required={required}
				disabled={disabled}
			/>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
