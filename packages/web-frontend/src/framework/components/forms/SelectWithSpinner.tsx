'use client';

import * as React from 'react';

import { Loader2 } from 'lucide-react';

import { Select } from './Select';

interface SelectWithSpinnerProps extends React.ComponentProps<typeof Select> {
	loading?: boolean;
}

/**
 * Select component with a loading spinner placed BESIDE the select (not inside it).
 *
 * The spinner is rendered as a flex sibling to the right of the select, so it never
 * overlaps the trigger's chevron arrow (bug #1 fix).
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
		<div className="flex w-full min-w-[120px] items-center gap-2">
			<div className="min-w-0 flex-1">
				<Select disabled={disabled || loading} {...props}>
					{children}
				</Select>
			</div>
			{loading && (
				<Loader2 data-testid="select-spinner" className="size-3 shrink-0 animate-spin text-muted-foreground" />
			)}
		</div>
	);
}
