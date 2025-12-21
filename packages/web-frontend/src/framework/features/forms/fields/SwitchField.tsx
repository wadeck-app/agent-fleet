import { Field } from '@framework/components/advanced/Field/Field';
import { FieldContent } from '@framework/components/advanced/Field/FieldContent';
import { FieldDescription } from '@framework/components/advanced/Field/FieldDescription';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Switch } from '@framework/components/forms/Switch';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * SWITCH FIELD - Complete switch form field (shadcn Field + Switch)
 * ===========================================================================================
 *
 * High-level component combining shadcn Field primitives with Switch component.
 * Maintains existing API while using modern shadcn styling.
 *
 * - Uses shadcn Field system with horizontal orientation
 * - Supports optional description text
 * - Better for boolean toggles than checkbox
 * - Switch and label are inline
 *
 * ===========================================================================================
 */

export interface SwitchFieldProps extends BaseFieldProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	description?: string;
}

export function SwitchField({
	label,
	checked,
	onChange,
	description,
	required = false,
	error,
	className = '',
	id,
}: SwitchFieldProps) {
	const fieldId = generateFieldId(label, id);

	return (
		<Field orientation="horizontal" className={className}>
			<Switch id={fieldId} checked={checked} onCheckedChange={onChange} required={required} />
			<FieldContent>
				<FieldLabel htmlFor={fieldId} className="cursor-pointer">
					{label}
					{required && <span className="ml-1 text-destructive">*</span>}
				</FieldLabel>
				{description && <FieldDescription>{description}</FieldDescription>}
				{error && <FieldError>{error}</FieldError>}
			</FieldContent>
		</Field>
	);
}
