import { type ReactNode } from 'react';

export interface PageProps {
	className?: string;
	children: ReactNode;
	/** If true, removes the max-width constraint to use full available width */
	fullWidth?: boolean;
}

/**
 * Page - Outer page container with max-width and padding
 *
 * Provides the standard container for application pages with:
 * - Responsive centered container
 * - Max-width of 7xl (80rem / 1280px) by default
 * - Uniform padding of 1.5rem (p-6)
 * - fullWidth option to remove width constraint
 *
 * @example
 * ```tsx
 * <Page>
 *   <PageHeader title="Books" badge={10} />
 *   <BookTable books={books} />
 * </Page>
 * ```
 *
 * @example
 * ```tsx
 * // Uses full available width
 * <Page fullWidth>
 *   <FlowEditor />
 * </Page>
 * ```
 */
export function Page({ className = '', children, fullWidth = false }: PageProps) {
	if (fullWidth) {
		return (
			<div
				className={`
      w-full p-6
      ${className}
    `}
			>
				{children}
			</div>
		);
	}

	return (
		<div
			className={`
     container mx-auto max-w-7xl p-6
     ${className}
   `}
		>
			{children}
		</div>
	);
}
