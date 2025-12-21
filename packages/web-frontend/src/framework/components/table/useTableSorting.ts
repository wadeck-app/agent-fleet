import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
	key: string;
	direction: SortDirection;
}

export interface UseTableSortingProps<T> {
	data: T[];
	initialSort?: SortConfig[];
}

export interface UseTableSortingReturn<T> {
	sortedData: T[];
	sortConfigs: SortConfig[];
	handleSort: (key: string, shiftKey: boolean, sortFn?: (a: T, b: T) => number) => void;
	getSortInfo: (key: string) => { direction: SortDirection; priority: number | null };
}

export function useTableSorting<T>({ data, initialSort = [] }: UseTableSortingProps<T>): UseTableSortingReturn<T> {
	const [sortConfigs, setSortConfigs] = useState<SortConfig[]>(initialSort);

	const handleSort = useCallback((key: string, shiftKey: boolean, _sortFn?: (a: T, b: T) => number) => {
		setSortConfigs(prev => {
			// Find existing sort for this column
			const existingIndex = prev.findIndex(config => config.key === key);

			if (!shiftKey) {
				// Regular click: replace all sorts with this one
				if (existingIndex >= 0) {
					const current = prev[existingIndex];
					if (!current) return prev; // Should never happen, but satisfy TypeScript
					// Cycle: asc -> desc -> null (remove)
					if (current.direction === 'asc') {
						return [{ key, direction: 'desc' }];
					}
					// desc -> null (clear all)
					return [];
				}
				// New column: start with asc
				return [{ key, direction: 'asc' }];
			} else {
				// Shift+click: add/modify in multi-sort
				if (existingIndex >= 0) {
					const current = prev[existingIndex];
					if (!current) return prev; // Should never happen, but satisfy TypeScript
					// Cycle through directions
					if (current.direction === 'asc') {
						// asc -> desc
						const newConfigs = [...prev];
						newConfigs[existingIndex] = { key, direction: 'desc' };
						return newConfigs;
					}
					// desc -> remove from list
					return prev.filter((_, index) => index !== existingIndex);
				}
				// New column: add to end with asc
				return [...prev, { key, direction: 'asc' }];
			}
		});
	}, []);

	const getSortInfo = useCallback(
		(key: string) => {
			const index = sortConfigs.findIndex(config => config.key === key);
			if (index < 0) {
				return { direction: null as SortDirection, priority: null };
			}
			const config = sortConfigs[index];
			if (!config) {
				return { direction: null as SortDirection, priority: null };
			}
			return {
				direction: config.direction,
				priority: sortConfigs.length > 1 ? index + 1 : null,
			};
		},
		[sortConfigs]
	);

	const compareValues = useCallback((aValue: unknown, bValue: unknown, direction: SortDirection): number => {
		// Handle null/undefined
		if (aValue == null && bValue == null) return 0;
		if (aValue == null) return 1;
		if (bValue == null) return -1;

		let comparison = 0;

		// String comparison
		if (typeof aValue === 'string' && typeof bValue === 'string') {
			comparison = aValue.localeCompare(bValue);
		}
		// Number comparison
		else if (typeof aValue === 'number' && typeof bValue === 'number') {
			comparison = aValue - bValue;
		}
		// Boolean comparison
		else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
			comparison = aValue === bValue ? 0 : aValue ? 1 : -1;
		}
		// Date comparison
		else if (aValue instanceof Date && bValue instanceof Date) {
			comparison = aValue.getTime() - bValue.getTime();
		}
		// Fallback: convert to string
		else {
			const aStr = String(aValue);
			const bStr = String(bValue);
			comparison = aStr.localeCompare(bStr);
		}

		return direction === 'asc' ? comparison : -comparison;
	}, []);

	const sortedData = useMemo(() => {
		if (sortConfigs.length === 0) {
			return data;
		}

		// Make a copy to avoid mutating original array
		const sorted = [...data];

		sorted.sort((a, b) => {
			// Apply each sort config in order (priority)
			for (const config of sortConfigs) {
				const aValue = (a as Record<string, unknown>)[config.key];
				const bValue = (b as Record<string, unknown>)[config.key];
				const result = compareValues(aValue, bValue, config.direction);

				// If values are different, return the comparison result
				if (result !== 0) {
					return result;
				}
				// If values are equal, continue to next sort config
			}
			// All sort configs resulted in equality
			return 0;
		});

		return sorted;
		// @formatter:off
		// eslint-disable-next-line no-restricted-syntax
	}, [data, sortConfigs, compareValues]);
	// @formatter:on

	return {
		sortedData,
		sortConfigs,
		handleSort,
		getSortInfo,
	};
}
