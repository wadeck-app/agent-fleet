import { Label } from './Label';
import { RadioGroupItem, RadioGroup as RadioGroupPrimitive } from './RadioGroup';

/**
 * ===========================================================================================
 * RADIO GROUP WRAPPER - High-level wrapper for Shadcn RadioGroup
 * ===========================================================================================
 *
 * Provides a simplified API matching the original Radix wrapper.
 * - Takes options[] array instead of rendering items manually
 * - Uses onChange callback instead of onValueChange
 * - Maintains backward compatibility with existing form code
 *
 * ===========================================================================================
 */

export interface RadioOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface RadioGroupWrapperProps {
	value: string;
	onChange: (value: string) => void;
	options: RadioOption[];
	orientation?: 'horizontal' | 'vertical';
	disabled?: boolean;
	required?: boolean;
	className?: string;
	id?: string;
}

export function RadioGroupWrapper({
	value,
	onChange,
	options,
	orientation = 'vertical',
	disabled = false,
	required = false,
	className = '',
	id,
}: RadioGroupWrapperProps) {
	return (
		<RadioGroupPrimitive
			id={id}
			value={value}
			onValueChange={onChange}
			disabled={disabled}
			required={required}
			className={`
     flex
     ${orientation === 'horizontal' ? 'flex-row gap-4' : `flex-col gap-3`}
     ${className}
   `}
		>
			{options.map(option => (
				<div key={option.value} className="flex items-center gap-2">
					<RadioGroupItem
						value={option.value}
						disabled={option.disabled || disabled}
						id={`${id}-${option.value}`}
					/>
					<Label
						htmlFor={`${id}-${option.value}`}
						className={`
        cursor-pointer text-sm
        peer-disabled:cursor-not-allowed peer-disabled:opacity-70
      `}
					>
						{option.label}
					</Label>
				</div>
			))}
		</RadioGroupPrimitive>
	);
}
