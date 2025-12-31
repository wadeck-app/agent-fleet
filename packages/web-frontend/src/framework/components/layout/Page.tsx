import { type ReactNode } from 'react';

export interface PageProps {
	className?: string;
	children: ReactNode;
	/** If true, removes the max-width constraint to use full available width */
	fullWidth?: boolean;
}

/**
 * Page - Container extérieur de page avec max-width et padding
 *
 * Fournit le container standard pour les pages de l'application avec:
 * - Container responsive centré
 * - Max-width de 7xl (80rem / 1280px) par défaut
 * - Padding uniforme de 1.5rem (p-6)
 * - Option fullWidth pour enlever la contrainte de largeur
 *
 * @example
 * ```tsx
 * <Page>
 *   <PageHeader title="Books" badge={10} />
 *   <PageContent>Content</PageContent>
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
