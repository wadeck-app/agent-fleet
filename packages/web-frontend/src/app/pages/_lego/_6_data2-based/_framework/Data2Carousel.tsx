import { type ReactNode, useState } from 'react';

import type { Table2Column } from '@framework/components2/table/Table2';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent } from '@framework/components/primitives/Card';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';

/**
 * ===========================================================================================
 * DATA2 CAROUSEL - Carousel Display Component for Data2
 * ===========================================================================================
 *
 * Displays items in a horizontal scrollable carousel.
 * Implements QueryResultDisplayerProps<T> for use with Data2.
 *
 * Features:
 * - Horizontal card layout (scrollable)
 * - Prev/Next navigation via pagination
 * - Field visibility toggle (local state)
 * - Loading and empty states
 *
 * ===========================================================================================
 */

export interface Data2CarouselProps<T> extends QueryResultDisplayerProps<T> {
	columns: Table2Column<T>[];
	getItemId: (item: T) => string;
}

export function Data2Carousel<T>({ data, isLoading, error, pagination, columns, getItemId }: Data2CarouselProps<T>) {
	const [showAllFields, setShowAllFields] = useState(false);

	const displayColumns = showAllFields ? columns : columns.slice(0, 4);

	return (
		<div className="space-y-4">
			{error && !isLoading && (
				<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
					<strong>Error:</strong> {error}
				</div>
			)}

			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{pagination && (
						<>
							Page {pagination.currentPage} of {pagination.totalPages}
						</>
					)}
				</div>

				<Button variant="outline" size="sm" onClick={() => setShowAllFields(!showAllFields)}>
					{showAllFields ? 'Show Less' : 'Show More'}
				</Button>
			</div>

			{isLoading && data.length === 0 && (
				<div className="flex gap-4 overflow-x-auto pb-4">
					{Array.from({ length: pagination?.pageSize ?? 5 }).map((_, idx) => (
						<Card key={idx} className="min-w-[280px] flex-shrink-0 animate-pulse">
							<CardContent className="p-4">
								<div className="space-y-2">
									<div className="h-4 w-3/4 rounded bg-muted" />
									<div className="h-3 w-1/2 rounded bg-muted" />
									<div className="h-3 w-2/3 rounded bg-muted" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{!isLoading && data.length === 0 && !error && (
				<div className="py-12 text-center text-sm text-muted-foreground">No items found</div>
			)}

			{data.length > 0 && (
				<div className="flex gap-4 overflow-x-auto pb-4">
					{data.map(item => {
						const itemId = getItemId(item);

						return (
							<Card
								key={itemId}
								className={`min-w-[280px] flex-shrink-0 ${isLoading ? 'opacity-50' : ''}`}
							>
								<CardContent className="p-4">
									<div className="space-y-2">
										{displayColumns.map(column => {
											const value = column.render(item);

											return (
												<div key={column.key}>
													<div className="text-xs text-muted-foreground">
														{column.label as ReactNode}
													</div>
													<div className="text-sm">{value}</div>
												</div>
											);
										})}
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			{pagination && (
				<div className="flex items-center justify-between">
					<Button
						onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
						disabled={pagination.currentPage === 1 || isLoading}
						size="sm"
					>
						Prev
					</Button>
					<div className="text-sm text-muted-foreground">
						Page {pagination.currentPage} of {pagination.totalPages}
					</div>
					<Button
						onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
						disabled={pagination.currentPage >= pagination.totalPages || isLoading}
						size="sm"
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}
