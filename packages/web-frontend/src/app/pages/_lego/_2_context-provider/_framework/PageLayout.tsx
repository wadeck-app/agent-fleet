import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * PAGE LAYOUT
 * ===========================================================================================
 *
 * Simple wrapper component for consistent page structure.
 * Provides spacing and layout for Lego pages.
 *
 * ===========================================================================================
 */

export interface PageLayoutProps {
	children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
	return <div className="space-y-4 p-4">{children}</div>;
}
