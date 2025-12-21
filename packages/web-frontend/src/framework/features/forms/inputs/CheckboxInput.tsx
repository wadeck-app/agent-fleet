import { Checkbox } from '@framework/components/forms/Checkbox';

/**
 * ===========================================================================================
 * CHECKBOX INPUT - Low-level input wrapper
 * ===========================================================================================
 *
 * Wrapper for Radix UI Checkbox component (previously native HTML checkbox).
 * - No label (use CheckboxField for that)
 * - Consistent styling
 * - Type-safe boolean value
 * - Enhanced accessibility via Radix UI
 * - Support for indeterminate state
 *
 * MIGRATION NOTE: This component now uses Radix UI internally but maintains
 * the same API for zero breaking changes.
 *
 * ===========================================================================================
 */

export interface CheckboxInputProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	id?: string;
}

// @formatter:off
export function CheckboxInput({ onChange, ...props }: CheckboxInputProps) {
	return <Checkbox onCheckedChange={onChange} {...props} />;
}
// @formatter:on
