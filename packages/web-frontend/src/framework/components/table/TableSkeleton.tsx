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
			{Array.from({ length: rowCount }).map((_, rowIndex) => {
				// Alternating row background colors (even/odd) - same as real rows
				const alternatingBg = rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/20';

				return (
					<tr
						key={`skeleton-row-${rowIndex}`}
						className={`
        border-b border-border transition-colors
        hover:bg-muted/50
        ${alternatingBg}
      `}
					>
						{/* Checkbox column */}
						{selectable && (
							<td className="h-12 px-4 py-2.5 text-center">
								<div className="mx-auto h-4 w-4 animate-pulse rounded bg-muted" />
							</td>
						)}

						{/* Data columns */}
						{columns.map(col => (
							<td key={`${col.key}-skeleton-${rowIndex}`} className="h-12 px-4 py-2.5">
								<div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
							</td>
						))}

						{/* Actions column */}
						{renderActions && (
							<td className="h-12 px-4 py-2.5 text-center">
								<div className="flex justify-center gap-2">
									<div className="h-7 w-7 animate-pulse rounded bg-muted" />
									<div className="h-7 w-7 animate-pulse rounded bg-muted" />
								</div>
							</td>
						)}
					</tr>
				);
			})}
		</tbody>
	);
}
