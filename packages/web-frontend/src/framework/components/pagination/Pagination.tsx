import { ReactNode } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	showFirstLast?: boolean;
	maxVisiblePages?: number;
	className?: string;
	previousLabel?: ReactNode;
	nextLabel?: ReactNode;
	firstLabel?: ReactNode;
	lastLabel?: ReactNode;
	disabled?: boolean;
}

/**
 * A generic pagination component that can be used with tables, grids, or any paginated content.
 *
 * Features:
 * - First/Previous/Next/Last navigation
 * - Smart page number display with ellipsis
 * - Customizable labels and max visible pages
 * - Keyboard accessible
 * - Mobile responsive
 *
 * @example
 * ```tsx
 * <Pagination
 *   currentPage={1}
 *   totalPages={10}
 *   onPageChange={(page) => setCurrentPage(page)}
 * />
 * ```
 */
export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	showFirstLast = true,
	maxVisiblePages = 5,
	className = '',
	previousLabel = <ChevronLeft className="h-4 w-4" />,
	nextLabel = <ChevronRight className="h-4 w-4" />,
	firstLabel = <ChevronsLeft className="h-4 w-4" />,
	lastLabel = <ChevronsRight className="h-4 w-4" />,
	disabled = false,
}: PaginationProps) {
	const isFirstPage = currentPage === 1;
	const isLastPage = currentPage === totalPages;

	// Calculate which page numbers to show
	const getVisiblePages = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
		if (totalPages <= maxVisiblePages) {
			// Show all pages if total is less than max
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		// Show max 2 pages before and after current page
		const halfVisible = Math.floor(maxVisiblePages / 2);
		const startPage = Math.max(1, currentPage - halfVisible);
		const endPage = Math.min(totalPages, currentPage + halfVisible);

		const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];

		// Add ellipsis at start if there are hidden pages before
		if (startPage > 1) {
			pages.push('ellipsis-start');
		}

		// Show pages around current page
		for (let i = startPage; i <= endPage; i++) {
			pages.push(i);
		}

		// Add ellipsis at end if there are hidden pages after
		if (endPage < totalPages) {
			pages.push('ellipsis-end');
		}

		return pages;
	};

	const visiblePages = getVisiblePages();

	// Always show pagination for consistent UX, even with single page
	return (
		<nav
			role="navigation"
			aria-label="Pagination"
			className={`
     flex items-center justify-center gap-1
     ${className}
   `}
		>
			{showFirstLast && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(1)}
					disabled={isFirstPage || disabled}
					aria-label="Go to first page"
					className={`
       hidden
       sm:inline-flex
     `}
				>
					{firstLabel}
				</Button>
			)}

			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={isFirstPage || disabled}
				aria-label="Go to previous page"
			>
				{previousLabel}
			</Button>

			<div className="flex items-center gap-1">
				{visiblePages.map(page => {
					if (page === 'ellipsis-start' || page === 'ellipsis-end') {
						return (
							<span
								key={`ellipsis-${page}`}
								className={`
          inline-flex h-8 w-8 items-center justify-center text-sm
          text-muted-foreground
        `}
								aria-hidden="true"
							>
								...
							</span>
						);
					}

					const isCurrentPage = page === currentPage;

					return (
						<Button
							key={page}
							variant={isCurrentPage ? 'default' : 'outline'}
							size="sm"
							onClick={() => onPageChange(page)}
							disabled={disabled}
							aria-label={`Go to page ${page}`}
							aria-current={isCurrentPage ? 'page' : undefined}
							className="min-w-[2rem]"
						>
							{page}
						</Button>
					);
				})}
			</div>

			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={isLastPage || disabled}
				aria-label="Go to next page"
			>
				{nextLabel}
			</Button>

			{showFirstLast && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(totalPages)}
					disabled={isLastPage || disabled}
					aria-label="Go to last page"
					className={`
       hidden
       sm:inline-flex
     `}
				>
					{lastLabel}
				</Button>
			)}
		</nav>
	);
}
