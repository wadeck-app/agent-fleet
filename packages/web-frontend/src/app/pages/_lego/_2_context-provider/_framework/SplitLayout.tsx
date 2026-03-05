import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * SPLIT LAYOUT
 * ===========================================================================================
 *
 * Two-column flex layout for master-detail scenarios.
 * Used in S6_ItemDetail to show table + detail panel side-by-side.
 *
 * No event bus needed - both views share the same ProductProvider context,
 * so when table selects an item via actions.select(), the detail panel
 * automatically reacts to context.selectedItem changes.
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
