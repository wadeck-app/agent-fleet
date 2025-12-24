import { NumberField, type NumberFieldProps } from './NumberField';

/**
 * ===========================================================================================
 * INTEGER FIELD - Convenience wrapper for NumberField
 * ===========================================================================================
 *
 * Preconfigured NumberField with step=1 for integer values.
 * Simplifies usage when you only need whole numbers.
 *
 * ===========================================================================================
 */

export type IntegerFieldProps = Omit<NumberFieldProps, 'step'> & {
	step?: 1;
};

export function IntegerField(props: IntegerFieldProps) {
	return <NumberField {...props} step={1} />;
}
