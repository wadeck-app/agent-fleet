import { type ReactNode } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { type SortDirection } from './useTableSorting';

export interface SortableColumnHeaderProps {
	label: string | ReactNode;
	sortDirection: SortDirection;
	priority?: number | null;
	onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
	className?: string;
}

export function SortableColumnHeader({
	label,
	sortDirection,
	priority,
	onClick,
	className = '',
}: SortableColumnHeaderProps) {
	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		onClick(event);
	};

	const getSortIcon = () => {
		if (sortDirection === 'asc') {
			return <ArrowUp className="h-4 w-4" />;
		}
		if (sortDirection === 'desc') {
			return <ArrowDown className="h-4 w-4" />;
		}
		return <ChevronsUpDown className="h-4 w-4 opacity-30" />;
	};

	return (
		<Button
			variant="ghost"
			onClick={handleClick}
			className={`
     flex cursor-pointer items-center gap-1 transition-colors
     hover:text-foreground
     ${className}
   `}
			type="button"
			aria-label={`Sort by ${label}${priority ? ` (priority ${priority})` : ''}`}
			title={
				priority
					? `Sorted ${sortDirection} (priority ${priority}). Shift+Click to add more sorts.`
					: 'Click to sort. Shift+Click for multi-column sort.'
			}
		>
			<span>{label}</span>
			<span className="flex items-center gap-0.5" aria-hidden="true">
				{getSortIcon()}
				{priority && <span className="text-xs font-semibold text-primary">{priority}</span>}
			</span>
		</Button>
	);
}
