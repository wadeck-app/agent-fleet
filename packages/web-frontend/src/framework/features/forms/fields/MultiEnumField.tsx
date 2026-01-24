import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { Label } from '@framework/components/forms/Label';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { X } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * MULTI-ENUM FIELD - Multi-select for enum types
 * ===========================================================================================
 *
 * Specialized field component for multi-enum type inputs with multiple selection.
 *
 * - Checkbox list for selection
 * - Selected count badge
 * - Remove individual selections
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface MultiEnumOption {
	value: string;
	label: string;
}

export interface MultiEnumFieldOptions {
	options: MultiEnumOption[];
}

export interface MultiEnumFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	options?: MultiEnumFieldOptions;
	placeholder?: string;
	disabled?: boolean;
}

export function MultiEnumField({
	label,
	value,
	onChange,
	options,
	required = false,
	disabled = false,
	error,
	className = '',
	id,
	description,
}: MultiEnumFieldProps) {
	const inputId = generateFieldId(label, id);

	// Parse value as JSON array or empty array
	const selectedValues: string[] = (() => {
		try {
			const parsed = value ? JSON.parse(value) : [];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	})();

	const handleToggle = (optionValue: string) => {
		const newSelected = selectedValues.includes(optionValue)
			? selectedValues.filter(v => v !== optionValue)
			: [...selectedValues, optionValue];
		onChange(JSON.stringify(newSelected));
	};

	const handleRemove = (optionValue: string) => {
		const newSelected = selectedValues.filter(v => v !== optionValue);
		onChange(JSON.stringify(newSelected));
	};

	const availableOptions = options?.options || [];

	return (
		<Field className={className} data-disabled={disabled}>
			<div className="flex items-center justify-between">
				<FieldLabel htmlFor={inputId}>
					{label}
					{required && <span className="ml-1 text-destructive">*</span>}
				</FieldLabel>
				{selectedValues.length > 0 && (
					<Badge variant="secondary" className="ml-2">
						{selectedValues.length} selected
					</Badge>
				)}
			</div>

			{/* Selected items */}
			{selectedValues.length > 0 && (
				<div className="mb-2 flex flex-wrap gap-1">
					{selectedValues.map(val => {
						const option = availableOptions.find(opt => opt.value === val);
						return (
							<Badge key={val} variant="default" className="pr-1 pl-2">
								{option?.label || val}
								<Button
									type="button"
									onClick={() => handleRemove(val)}
									disabled={disabled}
									variant="ghost"
									size="sm"
									className={`
           ml-1 h-auto rounded-full p-0
           hover:bg-primary-foreground/20
         `}
									aria-label={`Remove ${option?.label || val}`}
								>
									<X className="h-3 w-3" />
								</Button>
							</Badge>
						);
					})}
				</div>
			)}

			{/* Checkbox list */}
			<div className="space-y-2 rounded-md border border-input bg-background p-3">
				{availableOptions.length === 0 ? (
					<p className="text-sm text-muted-foreground">No options available</p>
				) : (
					availableOptions.map(option => (
						<div key={option.value} className="flex items-center space-x-2">
							<Checkbox
								id={`${inputId}-${option.value}`}
								checked={selectedValues.includes(option.value)}
								onCheckedChange={() => handleToggle(option.value)}
								disabled={disabled}
							/>
							<Label
								htmlFor={`${inputId}-${option.value}`}
								className={`
          text-sm leading-none font-normal
          peer-disabled:cursor-not-allowed peer-disabled:opacity-70
        `}
							>
								{option.label}
							</Label>
						</div>
					))
				)}
			</div>

			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
