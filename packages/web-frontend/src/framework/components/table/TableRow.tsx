import { type ReactNode } from 'react';

import { Checkbox } from '@framework/components/forms/Checkbox';

import { type TableColumn } from './Table';

export interface TableRowProps<T> {
	item: T;
	index: number;
	columns: TableColumn<T>[];
	selectable?: boolean;
	isSelected: boolean;
	isEditing: boolean;
	_isDeleting?: boolean;
	rowClassName: string;
	itemId: string;
	renderActions?: (item: T, isEditing: boolean) => ReactNode;
	onToggleSelection: (id: string, index: number, event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function TableRow<T>({
	item,
	index,
	columns,
	selectable,
	isSelected,
	isEditing,
	_isDeleting = false,
	rowClassName,
	itemId,
	renderActions,
	onToggleSelection,
}: TableRowProps<T>) {
	// Alternating row background colors (even/odd)
	const alternatingBg = index % 2 === 0 ? 'bg-background' : 'bg-muted/20';

	// @formatter:off
	// Wrapper to convert Checkbox onCheckedChange to input onChange event
	const handleCheckboxChange = () => {
		// Create a synthetic event compatible with the expected signature
		const syntheticEvent = {
			nativeEvent: new MouseEvent('click', {
				shiftKey: (window.event as MouseEvent)?.shiftKey || false,
			}),
		} as unknown as React.ChangeEvent<HTMLInputElement>;
		onToggleSelection(itemId, index, syntheticEvent);
	};
	// @formatter:on

	return (
		<tr
			className={`
     border-b border-border transition-colors
     last:border-0
     hover:bg-muted/50
     ${
			isSelected
				? `
      bg-primary/10
      hover:bg-primary/20
    `
				: alternatingBg
		}
     ${isEditing ? 'border-2 border-primary bg-accent/50' : ''}
     ${rowClassName}
   `}
			data-testid="table-row"
			data-row-id={itemId}
		>
			{selectable && (
				<td className="h-12 px-4 py-2.5 text-center">
					<Checkbox
						checked={isSelected}
						onCheckedChange={handleCheckboxChange}
						data-testid="row-checkbox"
						aria-label={`Select row ${index + 1}`}
					/>
				</td>
			)}
			{columns.map(column => (
				<td
					key={column.key}
					className={`
       h-12 px-4 py-2.5
       ${column.className || ''}
     `}
				>
					{column.render(item, isEditing)}
				</td>
			))}
			{renderActions && <td className="h-12 px-4 py-2.5 text-center">{renderActions(item, isEditing)}</td>}
		</tr>
	);
}
