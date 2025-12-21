import { Switch } from '@framework/components/forms/Switch';

/**
 * ===========================================================================================
 * SWITCH INPUT - Low-level switch wrapper
 * ===========================================================================================
 *
 * Wrapper for Radix UI Switch component.
 * - No label (use SwitchField for that)
 * - Boolean toggle (on/off)
 * - More visual than checkbox for toggles
 * - Type-safe boolean value
 *
 * ===========================================================================================
 */

export interface SwitchInputProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	required?: boolean;
	className?: string;
	id?: string;
}

// @formatter:off
export function SwitchInput({ onChange, ...props }: SwitchInputProps) {
	return <Switch onCheckedChange={onChange} {...props} />;
}
// @formatter:on
