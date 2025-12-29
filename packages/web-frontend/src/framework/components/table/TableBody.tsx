import { type ReactNode } from 'react';

import { LoadingDots } from '@framework/components/loading/LoadingDots';

import { type TableColumn } from './Table';
import { TableRow } from './TableRow';
import { TableSkeleton } from './TableSkeleton';

export interface TableBodyProps<T> {
	data: T[];
	columns: TableColumn<T>[];
	getItemId: (item: T) => string;
	loading?: boolean;
	initialLoading?: boolean;
	refreshing?: boolean;
	deleting?: boolean;
	emptyMessage?: string;
	loadingMessage?: string;
	selectable?: boolean;
	selectedIds: Set<string>;
	deletingIds: Set<string>;
	editingId?: string | null;
	getRowClassName?: (item: T) => string;
	renderActions?: (item: T, isEditing: boolean) => ReactNode;
	onToggleSelection: (id: string, index: number, event: React.ChangeEvent<HTMLInputElement>) => void;
	/** Number of skeleton rows to display during initial loading (defaults to 10) */
	skeletonRowCount?: number;
}

export function TableBody<T>({
	data,
	columns,
	getItemId,
	loading = false,
	initialLoading = false,
	refreshing = false,
	deleting = false,
	emptyMessage = 'No data available',
	loadingMessage = 'Loading...',
	selectable,
	selectedIds,
	deletingIds,
	editingId,
	getRowClassName,
	renderActions,
	onToggleSelection,
	skeletonRowCount = 10,
}: TableBodyProps<T>) {
	// Initial loading state (show skeleton rows)
	if (initialLoading) {
		return (
			<TableSkeleton
				columns={columns}
				rowCount={skeletonRowCount}
				selectable={selectable}
				renderActions={!!renderActions}
			/>
		);
	}

	// Loading state (show loading spinner)
	if (loading) {
		return (
			<tbody>
				<tr>
					<td
						colSpan={columns.length + (selectable ? 1 : 0) + (renderActions ? 1 : 0)}
						className="py-12 text-center text-muted-foreground"
					>
						<div className="flex flex-col items-center gap-4">
							<LoadingDots size="large" />
							<span>{loadingMessage}</span>
						</div>
					</td>
				</tr>
			</tbody>
		);
	}

	// Empty state
	if (data.length === 0) {
		return (
			<tbody>
				<tr>
					<td
						colSpan={columns.length + (selectable ? 1 : 0) + (renderActions ? 1 : 0)}
						className="py-12 text-center text-muted-foreground"
					>
						{emptyMessage}
					</td>
				</tr>
			</tbody>
		);
	}

	// Data rows
	return (
		<tbody
			className={
				refreshing || deleting
					? 'pointer-events-none opacity-50 blur-sm transition-all duration-200'
					: 'transition-all duration-200'
			}
		>
			{data.map((item, index) => {
				// @formatter:on
				const id = getItemId(item);
				const isSelected = selectedIds.has(id);
				const isEditing = editingId === id;
				const isDeleting = deletingIds.has(id);
				const rowClassName = getRowClassName ? getRowClassName(item) : '';

				return (
					<TableRow
						key={id}
						item={item}
						index={index}
						columns={columns}
						selectable={selectable}
						isSelected={isSelected}
						isEditing={isEditing}
						_isDeleting={isDeleting}
						rowClassName={rowClassName}
						itemId={id}
						renderActions={renderActions}
						onToggleSelection={onToggleSelection}
					/>
				);
			})}
		</tbody>
	);
}
