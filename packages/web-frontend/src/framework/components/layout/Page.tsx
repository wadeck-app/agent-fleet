import { type ReactNode } from 'react';

export interface PageProps {
	className?: string;
	children: ReactNode;
}

/**
 * Page - Container extérieur de page avec max-width et padding
 *
 * Fournit le container standard pour les pages de l'application avec:
 * - Container responsive centré
 * - Max-width de 7xl (80rem / 1280px)
 * - Padding uniforme de 1.5rem (p-6)
 *
 * @example
 * ```tsx
 * <Page>
 *   <PageHeader title="Books" badge={10} />
 *   <PageContent>
 *     {content}
 *   </PageContent>
 * </Page>
 * ```
 */
export function Page({ className = '', children }: PageProps) {
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
