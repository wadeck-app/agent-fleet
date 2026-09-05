import type { BadgeProps } from '@framework/components/primitives/Badge';
import type { InterventionStatus, InterventionType } from '@shared/api/interventions.contract';

/**
 * Get badge variant for intervention status
 * Follows application-wide convention for status colors
 */
export function getInterventionStatusVariant(status: InterventionStatus): BadgeProps['variant'] {
	switch (status) {
		case 'pending':
			return 'warning'; // Needs action - yellow
		case 'answered':
			return 'success'; // Resolved - green
		case 'timeout':
			return 'destructive'; // Failed - red
		case 'cancelled':
			return 'secondary'; // Neutral - gray
		default:
			throw new Error(`Unexpected switch value`);
	}
}

/**
 * Get badge variant for intervention type with distinct colors
 */
export function getInterventionTypeVariant(type: InterventionType): BadgeProps['variant'] {
	switch (type) {
		case 'approval':
			return 'default'; // Blue
		case 'question':
			return 'secondary'; // Gray
		case 'choice':
			return 'warning'; // Yellow/Orange
		default:
			throw new Error(`Unexpected switch value`);
	}
}
