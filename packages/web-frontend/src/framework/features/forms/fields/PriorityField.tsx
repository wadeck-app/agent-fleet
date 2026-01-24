import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Badge } from '@framework/components/primitives/Badge';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';
import { SelectInput, type SelectOption } from '../inputs/SelectInput';

/**
 * ===========================================================================================
 * PRIORITY FIELD - Priority selection with color-coded badges
 * ===========================================================================================
 *
 * Specialized field component for priority type inputs.
 *
 * - Select with predefined options: low, medium, high, urgent
 * - Color-coded badges (gray, yellow, orange, red)
 * - Visual preview of selected priority
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface PriorityFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

const PRIORITY_OPTIONS: SelectOption[] = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

const PRIORITY_COLORS: Record<string, 'default' | 'secondary' | 'warning' | 'destructive'> = {
	low: 'secondary',
	medium: 'default',
	high: 'warning',
	urgent: 'destructive',
};

export function PriorityField({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	error,
	className = '',
	id,
	description,
}: PriorityFieldProps) {
	const inputId = generateFieldId(label, id);

	const priorityVariant = PRIORITY_COLORS[value] || 'default';
	const priorityLabel = PRIORITY_OPTIONS.find(opt => opt.value === value)?.label || value;

	return (
		<Field className={className} data-disabled={disabled}>
			<div className="flex items-center justify-between">
				<FieldLabel htmlFor={inputId}>
					{label}
					{required && <span className="ml-1 text-destructive">*</span>}
				</FieldLabel>
				{value && (
					<Badge variant={priorityVariant} className="capitalize">
						{priorityLabel}
					</Badge>
				)}
			</div>
			<SelectInput
				id={inputId}
				value={value}
				onChange={onChange}
				options={PRIORITY_OPTIONS}
				placeholder={placeholder || 'Select priority...'}
				required={required}
				disabled={disabled}
			/>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
