import { type ReactNode } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { RefreshCw } from 'lucide-react';

export interface PageHeaderProps {
	/** Page title */
	title: string;
	/** Optional count badge (e.g., total items) - legacy support */
	badge?: string | number;
	/** Optional refresh handler - adds ghost icon-only refresh button next to title */
	onRefresh?: () => void;
	/** Whether refresh is in progress (shows spinning animation) */
	isRefreshing?: boolean;
	/** Optional action button(s) or other elements */
	action?: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * PageHeader - Header component for pages with title, optional refresh button, and actions
 *
 * Provides consistent page header layout following Ingredients pattern:
 * - Bold title (text-3xl)
 * - Optional refresh button (ghost, icon-only, h-8 w-8) next to title
 * - Optional action buttons/elements aligned to the right
 * - Consistent spacing: mb-6 for header, gap-2 for internal elements
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Workers"
 *   onRefresh={handleRefresh}
 *   isRefreshing={isRefreshing}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // With actions
 * <PageHeader
 *   title="Tasks"
 *   onRefresh={handleRefresh}
 *   isRefreshing={isRefreshing}
 *   action={<Button>Create Task</Button>}
 * />
 * ```
 */
export function PageHeader({ title, badge, onRefresh, isRefreshing = false, action, className = '' }: PageHeaderProps) {
	return (
		<div
			className={`
     mb-6 flex items-center justify-between
     ${className}
   `}
		>
			<div className="flex items-center gap-2">
				<h1 className="text-3xl font-bold">
					{title}
					{badge !== undefined && (
						<span
							className={`
       ml-2 text-lg text-muted-foreground
     `}
						>
							({badge})
						</span>
					)}
				</h1>
				{onRefresh && (
					<Button
						onClick={onRefresh}
						disabled={isRefreshing}
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0"
						aria-label="Refresh"
					>
						<RefreshCw
							className={`
         h-4 w-4
         ${isRefreshing ? 'animate-spin' : ''}
       `}
						/>
					</Button>
				)}
			</div>
			{action && <div className="flex items-center gap-2">{action}</div>}
		</div>
	);
}
