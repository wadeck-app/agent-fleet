import { RadioGroupWrapper as RadioGroup, type RadioOption } from '@framework/components/forms/RadioGroupWrapper';

/**
 * ===========================================================================================
 * RADIO GROUP INPUT - Low-level radio group wrapper
 * ===========================================================================================
 *
 * Wrapper for Radix UI RadioGroup component.
 * - No label or error display (use RadioGroupField for that)
 * - Mutually exclusive options
 * - Type-safe string value
 * - Keyboard navigation (Arrow keys)
 *
 * ===========================================================================================
 */

export interface RadioGroupInputProps {
	value: string;
	onChange: (value: string) => void;
	options: RadioOption[];
	orientation?: 'horizontal' | 'vertical';
	disabled?: boolean;
	required?: boolean;
	className?: string;
	id?: string;
}

// @formatter:off
export function RadioGroupInput(props: RadioGroupInputProps) {
	return <RadioGroup {...props} />;
}
// @formatter:on

// Re-export RadioOption for convenience
export type { RadioOption };
