import { TableColumn } from './Table';

export interface TableSkeletonProps<T> {
	columns: TableColumn<T>[];
	rowCount?: number;
	selectable?: boolean;
	renderActions?: boolean;
}

/**
 * TableSkeleton - Display skeleton loading rows in a table
 * Shows phantom rows while data is being loaded on initial page load
 */
export function TableSkeleton<T>({
	columns,
	rowCount = 10,
	selectable = false,
	renderActions = false,
}: TableSkeletonProps<T>) {
	return (
		<tbody>
			{Array.from({ length: rowCount }).map((_, rowIndex) => (
				<tr
					key={`skeleton-row-${rowIndex}`}
					className="border-b border-border transition-colors hover:bg-muted/50"
				>
					{/* Checkbox column */}
					{selectable && (
						<td className="px-4 py-3 w-12">
							<div className="h-4 w-4 bg-muted rounded animate-pulse" />
						</td>
					)}

					{/* Data columns */}
					{columns.map(col => (
						<td key={`${col.key}-skeleton-${rowIndex}`} className="px-4 py-3">
							<div
								className="h-4 bg-muted rounded animate-pulse w-full"
								style={{ maxWidth: `${70 + Math.random() * 30}%` }}
							/>
						</td>
					))}

					{/* Actions column */}
					{renderActions && (
						<td className="px-4 py-3">
							<div className="flex justify-center gap-2">
								<div className="h-8 w-8 bg-muted rounded animate-pulse" />
								<div className="h-8 w-8 bg-muted rounded animate-pulse" />
							</div>
						</td>
					)}
				</tr>
			))}
		</tbody>
	);
}
