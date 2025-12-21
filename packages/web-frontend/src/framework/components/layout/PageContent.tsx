import { type ReactNode } from 'react';

export interface PageContentProps {
	/** Content to render */
	children: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * PageContent - Semantic wrapper for main page content
 *
 * Provides a minimal wrapper for page content with optional styling.
 * This component is optional and mainly serves semantic purposes.
 *
 * @example
 * ```tsx
 * <Page>
 *   <PageHeader title="Books" badge={10} />
 *   <PageContent>
 *     <BookTable books={books} />
 *   </PageContent>
 * </Page>
 * ```
 *
 * @example
 * ```tsx
 * // Can be omitted for simpler layouts
 * <Page>
 *   <PageHeader title="Dashboard" />
 *   <div className="grid gap-4">
 *     <Card />
 *     <Card />
 *   </div>
 * </Page>
 * ```
 */
export function PageContent({ children, className = '' }: PageContentProps) {
	return <div className={className}>{children}</div>;
}
