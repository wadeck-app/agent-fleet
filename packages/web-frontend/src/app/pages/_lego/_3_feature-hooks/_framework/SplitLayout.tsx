import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * SPLIT LAYOUT - Two-Column Layout
 * ===========================================================================================
 *
 * Provides a two-column responsive layout.
 * Left column: main content (table, grid, etc.)
 * Right column: detail panel or secondary content
 *
 * In approach 3, there's no event bus — communication happens via callbacks and props.
 *
 * ===========================================================================================
 */

export interface SplitLayoutProps {
	children: ReactNode;
}

export function SplitLayout({ children }: SplitLayoutProps) {
	return <div className="flex h-full gap-4">{children}</div>;
}
