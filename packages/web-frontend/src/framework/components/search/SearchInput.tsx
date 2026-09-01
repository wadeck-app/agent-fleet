import { useCallback, useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Loader2, X } from 'lucide-react';

export interface SearchInputProps {
	value: string;
	onChange: (value: string) => void;
	onClear?: () => void;
	placeholder?: string;
	debounceMs?: number;
	disabled?: boolean;
	loading?: boolean;
	className?: string;
	'aria-label'?: string;
	id?: string;
}

export function SearchInput({
	value,
	onChange,
	onClear,
	placeholder = 'Search...',
	debounceMs = 400,
	disabled = false,
	loading = false,
	className,
	'aria-label': ariaLabel,
	id,
}: SearchInputProps) {
	const [internalValue, setInternalValue] = useState(value);

	// Sync internal value with prop value when it changes externally
	useEffect(() => {
		setInternalValue(value);
	}, [value]);

	// Debounce the onChange callback
	useEffect(() => {
		// Don't debounce if the value hasn't changed
		if (internalValue === value) {
			return;
		}

		const timeoutId = setTimeout(() => {
			onChange(internalValue);
		}, debounceMs);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [internalValue, debounceMs, onChange, value]);

	const handleClear = useCallback(() => {
		setInternalValue('');
		onChange('');
		onClear?.();
	}, [onChange, onClear]);

	return (
		<div className={cn('relative', className)}>
			<Input
				type="text"
				value={internalValue}
				onChange={e => setInternalValue(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				aria-label={ariaLabel}
				id={id}
				className="pr-8"
			/>
			{loading && (
				<div
					className={`
       absolute top-1/2 right-2 flex -translate-y-1/2 items-center
       justify-center
     `}
				>
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Searching" />
				</div>
			)}
			{!loading && internalValue && internalValue.length > 0 && !disabled && (
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					onClick={handleClear}
					disabled={disabled}
					aria-label="Clear search"
					className={cn(
						'absolute top-1/2 right-2 -translate-y-1/2',
						'flex h-5 w-5 items-center justify-center rounded-md',
						'text-muted-foreground transition-colors',
						'hover:bg-muted hover:text-foreground'
					)}
				>
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
