import { type ReactNode } from 'react';

export interface PageHeaderProps {
	/** Page title */
	title: string;
	/** Optional count badge (e.g., total items) */
	badge?: string | number;
	/** Optional action button(s) or other elements */
	action?: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * PageHeader - Header component for pages with title, optional badge, and actions
 *
 * Provides consistent page header layout with:
 * - Bold title (text-3xl)
 * - Optional count badge in muted color
 * - Optional action buttons/elements aligned to the right
 * - Flex layout with space-between
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Books"
 *   badge={totalCount}
 *   action={<Button>Add Book</Button>}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // With multiple actions
 * <PageHeader
 *   title="Ingredients"
 *   badge={50}
 *   action={
 *     <>
 *       <Button variant="outline">Export</Button>
 *       <Button>Add Ingredient</Button>
 *     </>
 *   }
 * />
 * ```
 */
export function PageHeader({ title, badge, action, className = '' }: PageHeaderProps) {
	return (
		<div
			className={`
    mb-6 flex flex-col gap-4
    sm:flex-row sm:items-center sm:justify-between
    ${className}
  `}
		>
			<h1 className="text-3xl font-bold">
				{title}
				{badge !== undefined && <span className="ml-2 text-lg text-muted-foreground">({badge})</span>}
			</h1>
			{action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
		</div>
	);
}
