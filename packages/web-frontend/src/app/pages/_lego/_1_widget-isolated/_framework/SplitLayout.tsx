import React, { type ReactNode } from 'react';

import { createPageEventContext } from './PageEventContext';

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
 *
 * Usage:
 * ```tsx
 * type ProductPageEvents = {
 *   'product:selected': { id: string };
 * };
 *
 * <SplitLayout<ProductPageEvents>>
 *   <WidgetDataTable ... emits={['product:selected']} />
 *   <WidgetDetailPanel ... listens={['product:selected']} />
 * </SplitLayout>
 * ```
 *
 * ===========================================================================================
 */

export interface SplitLayoutProps {
	children: ReactNode;
}

export function SplitLayout({ children }: SplitLayoutProps): React.ReactElement {
	const { PageEventProvider } = createPageEventContext<Record<string, unknown>>();

	return (
		<PageEventProvider>
			<div className="flex h-full gap-4">{children}</div>
		</PageEventProvider>
	);
}
