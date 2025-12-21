import { BASE_INPUT_CLASSES } from '../fieldUtils';

/**
 * ===========================================================================================
 * NUMBER INPUT - Low-level input wrapper
 * ===========================================================================================
 *
 * Wrapper for number HTML input type.
 * - No label or error display (use NumberField for that)
 * - Consistent styling
 * - Type-safe number value
 * - Configurable step, min, max
 *
 * ===========================================================================================
 */

export interface NumberInputProps {
	value: number;
	onChange: (value: number) => void;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	step?: number;
	min?: number;
	max?: number;
	className?: string;
	id?: string;
}

export function NumberInput({
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	step,
	min,
	max,
	className = '',
	id,
}: NumberInputProps) {
	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(Number(e.target.value));
	};

	return (
		// eslint-disable-next-line no-restricted-syntax
		<input
			id={id}
			type="number"
			value={value}
			onChange={handleChange}
			placeholder={placeholder}
			required={required}
			disabled={disabled}
			step={step}
			min={min}
			max={max}
			className={`
     ${BASE_INPUT_CLASSES}
     ${className}
   `}
		/>
	);
}
