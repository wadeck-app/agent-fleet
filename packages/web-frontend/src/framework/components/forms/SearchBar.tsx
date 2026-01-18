import type React from 'react';

import { X } from 'lucide-react';

import { Button } from '../primitives/Button';
import { Input } from './Input';

export interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	onClear: () => void;
	placeholder?: string;
	label?: string;
	className?: string;
}

export function SearchBar({
	value,
	onChange,
	onClear,
	placeholder = 'Search...',
	label = 'Search',
	className,
}: SearchBarProps) {
	return (
		<div className={className}>
			<div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
			<div className="relative">
				<Input
					type="text"
					value={value}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
					placeholder={placeholder}
				/>
				{value && (
					<Button
						onClick={onClear}
						variant="ghost"
						size="sm"
						className="absolute top-1/2 right-2 h-6 w-6 -translate-y-1/2 p-0"
						aria-label="Clear search"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
