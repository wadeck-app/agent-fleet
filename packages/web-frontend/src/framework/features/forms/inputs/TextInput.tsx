import { BASE_INPUT_CLASSES } from '../fieldUtils';

/**
 * ===========================================================================================
 * TEXT INPUT - Low-level input wrapper
 * ===========================================================================================
 *
 * Wrapper for text-based HTML input types (text, email, password, tel).
 * - No label or error display (use TextField for that)
 * - Consistent styling
 * - Type-safe string value
 *
 * ===========================================================================================
 */

export interface TextInputProps {
	type?: 'text' | 'email' | 'password' | 'tel' | 'url';
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	id?: string;
}

export function TextInput({
	type = 'text',
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	className = '',
	id,
}: TextInputProps) {
	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(e.target.value);
	};

	return (
		// eslint-disable-next-line no-restricted-syntax
		<input
			id={id}
			type={type}
			value={value}
			onChange={handleChange}
			placeholder={placeholder}
			required={required}
			disabled={disabled}
			className={`
     ${BASE_INPUT_CLASSES}
     ${className}
   `}
		/>
	);
}
