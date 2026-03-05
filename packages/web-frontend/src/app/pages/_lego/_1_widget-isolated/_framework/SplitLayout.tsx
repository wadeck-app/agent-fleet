import React, { type ReactNode } from 'react';

import { GlobalPageEventProvider } from './GlobalEventContext';

/**
 * ===========================================================================================
 * SPLIT LAYOUT - Two-Column Layout with Event Bus
 * ===========================================================================================
 *
 * Provides a two-column responsive layout with integrated event bus context.
 * Left column: main content (table, grid, etc.)
 * Right column: detail panel or secondary content
 *
 * Features:
 * - Integrated event bus context
 * - Responsive flex layout
 * - Type-safe events per page
 * - Configurable right panel width
 *
 * Usage:
 * ```tsx
 * <SplitLayout
 *   left={<WidgetDataTable ... emits={['product:selected']} />}
 *   right={<WidgetDetailPanel ... listens={['product:selected']} />}
 *   rightWidth="md"
 * />
 * ```
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

export function SplitLayout({ left, right, rightWidth = 'md' }: SplitLayoutProps): React.ReactElement {
	return (
		<GlobalPageEventProvider>
			<div className="flex h-full gap-4">
				<div className="flex-1">{left}</div>
				<div className={RIGHT_WIDTH_CLASSES[rightWidth]}>{right}</div>
			</div>
		</GlobalPageEventProvider>
	);
}
