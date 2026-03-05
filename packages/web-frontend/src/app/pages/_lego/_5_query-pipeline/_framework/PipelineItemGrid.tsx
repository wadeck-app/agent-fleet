import { Pagination } from '@framework/components/pagination/Pagination';
import { Button } from '@framework/components/primitives/Button';
import { renderColumnValue } from '@framework/lego';
import { Edit, Trash2 } from 'lucide-react';

import { usePipelineContext } from './PipelineContext';

/**
 * ===========================================================================================
 * PIPELINE ITEM GRID
 * ===========================================================================================
 *
 * Displays items in a responsive grid layout (2-4 columns).
 * Reads data from PipelineContext.
 *
 * Features:
 * - Grid layout with responsive columns
 * - Edit and Delete buttons (optional)
 * - Loading state
 * - Empty state
 *
 * ===========================================================================================
 */

export interface PipelineItemGridProps<T> {
	onEdit?: (item: T) => void;
	onDelete?: (item: T) => void;
	showPagination?: boolean;
}

export function PipelineItemGrid<T extends { id: string }>({
	onEdit,
	onDelete,
	showPagination = false,
}: PipelineItemGridProps<T> = {}) {
	const { items, loading, columns, pagination, setPage } = usePipelineContext<T>();

	const renderCellValue = (item: T, colKey: keyof T) => {
		const col = columns.find(c => c.key === colKey);
		if (!col) {
			return null;
		}
		return renderColumnValue(col, item);
	};

	return (
		<>
			{loading && <div className="p-8 text-center">Loading...</div>}
			{!loading && items.length === 0 && <div className="p-8 text-center">No items found</div>}
			{!loading && items.length > 0 && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{items.map(item => (
						<div key={item.id} className="rounded-lg border border-border bg-card p-4">
							<div className="space-y-2">
								{columns.slice(0, 4).map(col => (
									<div key={col.key as string} className="text-sm">
										<span className="font-semibold">{col.label}: </span>
										{renderCellValue(item, col.key)}
									</div>
								))}
							</div>
							{(onEdit || onDelete) && (
								<div className="mt-4 flex gap-2">
									{onEdit && (
										<Button onClick={() => onEdit(item)} size="sm" variant="outline">
											<Edit className="size-3" />
											Edit
										</Button>
									)}
									{onDelete && (
										<Button onClick={() => onDelete(item)} size="sm" variant="destructive">
											<Trash2 className="size-3" />
											Delete
										</Button>
									)}
								</div>
							)}
						</div>
					))}
				</div>
			)}
			{showPagination && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Page {pagination.page} of {pagination.totalPages}
					</div>
					<Pagination
						currentPage={pagination.page}
						totalPages={pagination.totalPages}
						onPageChange={setPage}
					/>
				</div>
			)}
		</>
	);
}
