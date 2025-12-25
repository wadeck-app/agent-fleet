import type { FC, ReactNode } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import type { BadgeProps } from '@framework/components/primitives/Badge';

/**
 * ===========================================================================================
 * STATUS BADGE - Feature Component
 * ===========================================================================================
 *
 * Reusable status badge with semantic variants for connection states, statuses, etc.
 *
 * Features:
 * - Semantic variants: success, warning, error, info, neutral
 * - Built on top of Badge primitive
 * - Type-safe variant prop
 *
 * Usage:
 * ```tsx
 * <StatusBadge variant="success">Connected</StatusBadge>
 * <StatusBadge variant="warning">Reconnecting...</StatusBadge>
 * <StatusBadge variant="error">Failed</StatusBadge>
 * ```
 *
 * ===========================================================================================
 */

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
	/** Badge variant (semantic) */
	variant: StatusBadgeVariant;
	/** Badge content */
	children: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Maps semantic variants to Badge primitive variants
 */
const variantMap: Record<StatusBadgeVariant, BadgeProps['variant']> = {
	success: 'success',
	warning: 'warning',
	error: 'destructive',
	info: 'info',
	neutral: 'secondary',
};

export const StatusBadge: FC<StatusBadgeProps> = ({ variant, children, className }) => {
	const badgeVariant = variantMap[variant];

	return (
		<Badge variant={badgeVariant} className={className}>
			{children}
		</Badge>
	);
};
