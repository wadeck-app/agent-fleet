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
			return 'secondary';
	}
}

/**
 * Get emoji icon for intervention type
 */
export function getInterventionTypeIcon(type: InterventionType): string {
	switch (type) {
		case 'approval':
			return '⏸️';
		case 'question':
			return '💬';
		case 'choice':
			return '❓';
		default:
			return '❓';
	}
}

/**
 * Get badge variant for intervention type
 */
export function getInterventionTypeVariant(type: InterventionType): BadgeProps['variant'] {
	// All types use default variant - differentiated by icon
	return 'default';
}
