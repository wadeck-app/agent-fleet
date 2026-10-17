import { Checkbox } from '@framework/components/forms/Checkbox';

import { type TableColumn } from './Table';

export interface TableHeaderProps<T> {
	columns: TableColumn<T>[];
	selectable?: boolean;
	renderActions?: boolean;
	selectAllChecked: boolean | 'indeterminate';
	selectAllDisabled: boolean;
	selectAllCheckboxRef: React.RefObject<HTMLButtonElement | null>;
	onToggleSelectAll: () => void;
}

export function TableHeader<T>({
	columns,
	selectable,
	renderActions,
	selectAllChecked,
	selectAllDisabled,
	selectAllCheckboxRef,
	onToggleSelectAll,
}: TableHeaderProps<T>) {
	return (
		<thead
			className={`
    border-b border-border bg-secondary text-secondary-foreground
  `}
		>
			<tr>
				{selectable && (
					<th className="h-12 w-12 px-4 py-3 text-center">
						<Checkbox
							ref={selectAllCheckboxRef}
							checked={selectAllChecked}
							onCheckedChange={onToggleSelectAll}
							disabled={selectAllDisabled}
							aria-label="Select all rows"
						/>
					</th>
				)}
				{columns.map(column => (
					<th
						key={column.key}
						className={`
        h-12 px-4 py-3 text-left text-sm font-medium
        ${column.className || ''}
      `}
					>
						{column.label}
					</th>
				))}
				{renderActions && (
					<th
						className={`
      h-12 w-32 px-4 py-3 text-center text-sm font-medium
    `}
					>
						Actions
					</th>
				)}
			</tr>
		</thead>
	);
}
