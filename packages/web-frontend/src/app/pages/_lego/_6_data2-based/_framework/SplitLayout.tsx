import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * SPLIT LAYOUT - Responsive Split-Panel Container
 * ===========================================================================================
 *
 * Two-column responsive layout for master-detail scenarios.
 * Left panel: List/table view
 * Right panel: Detail/editing panel
 *
 * Features:
 * - Responsive breakpoints (stacks on mobile)
 * - Flexible right panel sizing
 * - Sticky positioning for detail panel
 *
 * ===========================================================================================
 */

export interface SplitLayoutProps {
	left: ReactNode;
	right: ReactNode;
	rightWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const RIGHT_WIDTH_CLASSES = {
	sm: 'lg:w-64',
	md: 'lg:w-80',
	lg: 'lg:w-96',
	xl: 'lg:w-[32rem]',
} as const;

export function SplitLayout({ left, right, rightWidth = 'md' }: SplitLayoutProps) {
	const rightWidthClass = RIGHT_WIDTH_CLASSES[rightWidth];

	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
			<div className="flex-1 overflow-hidden">{left}</div>
			<div className={`flex-shrink-0 ${rightWidthClass}`}>
				<div className="sticky top-4">{right}</div>
			</div>
		</div>
	);
}
