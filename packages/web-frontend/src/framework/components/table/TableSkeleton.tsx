import { type TableColumn } from './Table';

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
					className={`
       border-b border-border transition-colors
       hover:bg-muted/50
     `}
				>
					{/* Checkbox column */}
					{selectable && (
						<td className="w-12 px-4 py-3">
							<div className="h-4 w-4 animate-pulse rounded bg-muted" />
						</td>
					)}

					{/* Data columns */}
					{columns.map(col => (
						<td key={`${col.key}-skeleton-${rowIndex}`} className="px-4 py-3">
							<div
								className="h-4 w-full animate-pulse rounded bg-muted"
								style={{ maxWidth: `${70 + Math.random() * 30}%` }}
							/>
						</td>
					))}

					{/* Actions column */}
					{renderActions && (
						<td className="px-4 py-3">
							<div className="flex justify-center gap-2">
								<div className="h-8 w-8 animate-pulse rounded bg-muted" />
								<div className="h-8 w-8 animate-pulse rounded bg-muted" />
							</div>
						</td>
					)}
				</tr>
			))}
		</tbody>
	);
}
