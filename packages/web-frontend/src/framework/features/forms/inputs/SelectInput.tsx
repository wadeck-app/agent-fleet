import { Select } from '@framework/components/forms/Select';

/**
 * ===========================================================================================
 * SELECT INPUT - Low-level select wrapper
 * ===========================================================================================
 *
 * Wrapper for Radix UI Select component (previously native HTML select).
 * - No label or error display (use SelectField for that)
 * - Consistent styling
 * - Type-safe string value
 * - Options with value/label pairs
 * - Enhanced accessibility via Radix UI
 * - Better keyboard navigation
 *
 * MIGRATION NOTE: This component now uses Radix UI internally but maintains
 * the same API for zero breaking changes.
 *
 * ===========================================================================================
 */

export interface SelectOption {
	value: string;
	label: string;
}

export interface SelectInputProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	id?: string;
}

// @formatter:off
export function SelectInput(props: SelectInputProps) {
	return <Select {...props} />;
}
// @formatter:on
