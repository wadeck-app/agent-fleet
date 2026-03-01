import { useState } from 'react';

/**
 * ===========================================================================================
 * USE SORTING FEATURE - Sorting Feature Hook
 * ===========================================================================================
 *
 * React hook that provides sorting state management for data tables.
 * Returns a typed feature object that widgets can consume.
 *
 * Usage:
 * ```tsx
 * const sorting = useSortingFeature();
 * <HookDataTable features={[sorting, ...]} />
 * ```
 *
 * ===========================================================================================
 */

export interface SortingFeatureHook {
	type: 'sorting';
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
	setSort: (key?: string, order?: 'asc' | 'desc') => void;
}

export function useSortingFeature(): SortingFeatureHook {
	const [sortBy, setSortBy] = useState<string | undefined>(undefined);
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(undefined);

	return {
		type: 'sorting',
		sortBy,
		sortOrder,
		setSort: (key?: string, order?: 'asc' | 'desc') => {
			setSortBy(key);
			setSortOrder(order);
		},
	};
}
