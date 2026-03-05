import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * SPLIT LAYOUT - Two-Column Layout for Compound Components
 * ===========================================================================================
 *
 * Provides a two-column responsive layout.
 * Left column: main content (table, grid, etc.)
 * Right column: detail panel or secondary content
 *
 * In approach 4, compound components manage their own internal layout.
 * This SplitLayout provides the outer structure.
 *
 * Features:
 * - Configurable right panel width
 * - No className in pages
 *
 * ===========================================================================================
 */

export interface SplitLayoutProps {
	left: ReactNode;
	right: ReactNode;
	rightWidth?: 'sm' | 'md' | 'lg';
}

const RIGHT_WIDTH_CLASSES = {
	sm: 'w-72',
	md: 'w-96',
	lg: 'w-[36rem]',
} as const;

export function SplitLayout({ left, right, rightWidth = 'md' }: SplitLayoutProps) {
	return (
		<div className="flex h-full gap-4">
			<div className="flex-1">{left}</div>
			<div className={RIGHT_WIDTH_CLASSES[rightWidth]}>{right}</div>
		</div>
	);
}
