import type { ReactNode } from 'react';

import type { Table2Column } from '@framework/components2/table/Table2';
import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent } from '@framework/components/primitives/Card';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';

/**
 * ===========================================================================================
 * DATA2 ITEM GRID - Grid Display Component for Data2
 * ===========================================================================================
 *
 * Displays items as a responsive grid of cards.
 * Implements QueryResultDisplayerProps<T> for use with Data2.
 *
 * Features:
 * - Responsive grid (2-4 columns based on screen size)
 * - Pagination controls (if pagination feature enabled)
 * - Loading and empty states
 * - Optional edit/delete actions per card
 *
 * ===========================================================================================
 */

const errorBannerCls =
	'rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive';

export interface Data2ItemGridProps<T> extends QueryResultDisplayerProps<T> {
	columns: Table2Column<T>[];
	getItemId: (item: T) => string;
	onEdit?: (item: T) => void;
	onDelete?: (item: T) => void;
}

export function Data2ItemGrid<T>({
	data,
	isLoading,
	error,
	pagination,
	columns,
	getItemId,
	onEdit,
	onDelete,
}: Data2ItemGridProps<T>) {
	return (
		<div className="space-y-4">
			{error && !isLoading && (
				<div className={errorBannerCls}>
					<strong>Error:</strong> {error}
				</div>
			)}

			{isLoading && data.length === 0 && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: pagination?.pageSize ?? 12 }).map((_, idx) => (
						<Card key={idx} className="animate-pulse">
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
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{data.map(item => {
						const itemId = getItemId(item);

						return (
							<Card key={itemId} className={isLoading ? 'opacity-50' : ''}>
								<CardContent className="p-4">
									<div className="space-y-2">
										{columns.slice(0, 4).map(column => {
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

									{(onEdit || onDelete) && (
										<div className="mt-4 flex gap-2">
											{onEdit && (
												<Button size="sm" variant="outline" onClick={() => onEdit(item)}>
													Edit
												</Button>
											)}
											{onDelete && (
												<Button size="sm" variant="destructive" onClick={() => onDelete(item)}>
													Delete
												</Button>
											)}
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			{pagination && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						{data.length > 0 ? (
							<>
								Showing {(pagination.currentPage - 1) * pagination.pageSize + 1} to{' '}
								{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} of{' '}
								{pagination.totalItems} items
							</>
						) : (
							<>No items</>
						)}
					</div>

					<div className="flex items-center gap-4">
						<PageSizeSelector
							value={pagination.pageSize}
							onChange={pagination.onPageSizeChange}
							options={pagination.pageSizeOptions || [5, 10, 20, 50]}
							size="sm"
						/>

						<div className="text-sm text-muted-foreground">
							Page {pagination.currentPage} of {pagination.totalPages}
						</div>

						<Pagination
							currentPage={pagination.currentPage}
							totalPages={pagination.totalPages}
							onPageChange={pagination.onPageChange}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
