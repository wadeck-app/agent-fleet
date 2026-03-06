'use client';

import * as React from 'react';

import { Loader2 } from 'lucide-react';

import { Select } from './Select';

interface SelectWithSpinnerProps extends React.ComponentProps<typeof Select> {
	loading?: boolean;
}

/**
 * Select component with integrated loading spinner overlay.
 *
 * Usage:
 * ```tsx
 * <SelectWithSpinner value={status} onValueChange={handleChange} loading={isSaving}>
 *   <SelectTrigger><SelectValue /></SelectTrigger>
 *   <SelectContent>
 *     <SelectItem value="option1">Option 1</SelectItem>
 *   </SelectContent>
 * </SelectWithSpinner>
 * ```
 */
export function SelectWithSpinner({ loading, children, disabled, ...props }: SelectWithSpinnerProps) {
	return (
		<div className="relative inline-block">
			<Select disabled={disabled || loading} {...props}>
				{children}
			</Select>
			{loading && (
				<div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
					<Loader2 className="size-3 animate-spin text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
