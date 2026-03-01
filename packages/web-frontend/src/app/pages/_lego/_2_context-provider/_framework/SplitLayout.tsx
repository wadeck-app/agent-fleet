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
 * ===========================================================================================
 */

export interface SplitLayoutProps {
	children: ReactNode;
}

export function SplitLayout({ children }: SplitLayoutProps) {
	return <div className="flex gap-4 p-4">{children}</div>;
}
