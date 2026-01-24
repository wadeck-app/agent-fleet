import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * ENHANCED NUMBER FIELD - Number input with type-specific features
 * ===========================================================================================
 *
 * Specialized number field for integer, percentage, and duration types.
 *
 * - Number input with spinner controls
 * - Type-specific suffixes (%, s, ms)
 * - Min/max validation from options
 * - Step controls for precision
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export type NumberFieldType = 'integer' | 'percentage' | 'duration' | 'number';

export interface NumberFieldOptions {
	min?: number;
	max?: number;
	step?: number;
	unit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'milliseconds';
}

export interface EnhancedNumberFieldProps extends BaseFieldProps {
	type?: NumberFieldType;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	options?: NumberFieldOptions;
}

export function EnhancedNumberField({
	label,
	type = 'number',
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	options,
	error,
	className = '',
	id,
	description,
}: EnhancedNumberFieldProps) {
	const inputId = generateFieldId(label, id);

	// Determine suffix based on type
	const getSuffix = (): string => {
		if (type === 'percentage') return '%';
		if (type === 'duration') {
			const unit = options?.unit || 'seconds';
			const unitMap: Record<string, string> = {
				seconds: 's',
				minutes: 'm',
				hours: 'h',
				days: 'd',
				milliseconds: 'ms',
			};
			return unitMap[unit] || 's';
		}
		return '';
	};

	const suffix = getSuffix();

	// Determine step based on type
	const step = options?.step || (type === 'integer' ? 1 : type === 'percentage' ? 0.1 : 1);

	// Handle validation
	const validateValue = (val: string): string | undefined => {
		if (!val.trim()) return error;

		const numValue = parseFloat(val);
		if (isNaN(numValue)) return 'Invalid number';

		if (options?.min !== undefined && numValue < options.min) {
			return `Minimum value is ${options.min}`;
		}

		if (options?.max !== undefined && numValue > options.max) {
			return `Maximum value is ${options.max}`;
		}

		if (type === 'percentage' && (numValue < 0 || numValue > 100)) {
			return 'Percentage must be between 0 and 100';
		}

		return error;
	};

	const validationError = value ? validateValue(value) : error;

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<div className="relative">
				<Input
					id={inputId}
					type="number"
					value={value}
					onChange={e => onChange(e.target.value)}
					placeholder={placeholder}
					required={required}
					disabled={disabled}
					step={step}
					min={options?.min}
					max={options?.max}
					aria-invalid={!!validationError}
					className={suffix ? 'pr-12' : ''}
				/>
				{suffix && (
					<div
						className={`
       pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm
       text-muted-foreground
     `}
					>
						{suffix}
					</div>
				)}
			</div>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{validationError && <FieldError>{validationError}</FieldError>}
		</Field>
	);
}
