import { BASE_INPUT_CLASSES } from '../fieldUtils';

/**
 * ===========================================================================================
 * TEXTAREA INPUT - Low-level textarea wrapper
 * ===========================================================================================
 *
 * Wrapper for textarea HTML element.
 * - No label or error display (use TextAreaField for that)
 * - Consistent styling
 * - Type-safe string value
 * - Configurable rows
 *
 * ===========================================================================================
 */

export interface TextAreaInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	rows?: number;
	className?: string;
	id?: string;
}

export function TextAreaInput({
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	rows = 4,
	className = '',
	id,
}: TextAreaInputProps) {
	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		onChange(e.target.value);
	};

	return (
		// eslint-disable-next-line no-restricted-syntax
		<textarea
			id={id}
			value={value}
			onChange={handleChange}
			placeholder={placeholder}
			required={required}
			disabled={disabled}
			rows={rows}
			className={`
     ${BASE_INPUT_CLASSES}
     resize-y
     ${className}
   `}
		/>
	);
}
