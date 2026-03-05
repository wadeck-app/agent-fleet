import type { ReactNode } from 'react';

/**
 * ===========================================================================================
 * PAGE LAYOUT - Simple Wrapper for A6 Data2-Based Approach
 * ===========================================================================================
 *
 * Minimal wrapper component for page content.
 * No context, no providers - just a passthrough container.
 *
 * ===========================================================================================
 */

export interface PageLayoutProps {
	children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
	return <>{children}</>;
}
