import { BASE_INPUT_CLASSES } from '../fieldUtils';

/**
 * ===========================================================================================
 * DATE INPUT - Low-level input wrapper
 * ===========================================================================================
 *
 * Wrapper for date HTML input type.
 * - No label or error display (use DateField for that)
 * - Consistent styling
 * - Type-safe string value (ISO date format YYYY-MM-DD)
 * - Configurable min/max dates
 *
 * ===========================================================================================
 */

export interface DateInputProps {
	value: string;
	onChange: (value: string) => void;
	required?: boolean;
	disabled?: boolean;
	min?: string;
	max?: string;
	className?: string;
	id?: string;
}

export function DateInput({
	value,
	onChange,
	required = false,
	disabled = false,
	min,
	max,
	className = '',
	id,
}: DateInputProps) {
	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(e.target.value);
	};

	return (
		// eslint-disable-next-line no-restricted-syntax
		<input
			id={id}
			type="date"
			value={value}
			onChange={handleChange}
			required={required}
			disabled={disabled}
			min={min}
			max={max}
			className={`
     ${BASE_INPUT_CLASSES}
     ${className}
   `}
		/>
	);
}
