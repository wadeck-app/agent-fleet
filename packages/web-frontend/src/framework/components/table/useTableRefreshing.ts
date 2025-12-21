import { useEffect, useRef, useState } from 'react';

/**
 * Hook to track table refreshing state (when data is being re-fetched due to pagination, sorting, etc.)
 *
 * This hook monitors changes to pagination, sorting, and other table parameters,
 * and provides a `refreshing` state that can be used to show visual feedback (like blur effect).
 *
 * @param dependencies - Object containing values that trigger a refresh
 * @param loading - Current loading state from data fetching
 * @returns isRefreshing - True when table is refreshing (between parameter change and data load completion)
 *
 * @example
 * ```tsx
 * const isRefreshing = useTableRefreshing({
 *   page: pagination.currentPage,
 *   pageSize: pagination.pageSize,
 *   sortBy,
 *   sortOrder,
 * }, loading);
 *
 * <Table refreshing={isRefreshing} ... />
 * ```
 */
export function useTableRefreshing(dependencies: Record<string, unknown>, loading: boolean): boolean {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const isFirstRender = useRef(true);
	const prevDependencies = useRef<Record<string, unknown>>({});

	// Convert dependencies object to a stable string for comparison
	const depsString = JSON.stringify(dependencies);

	// Check if any dependency has changed
	useEffect(() => {
		// Skip on first render
		if (isFirstRender.current) {
			isFirstRender.current = false;
			prevDependencies.current = { ...dependencies };
			return;
		}

		// Check if any dependency has changed by comparing values
		const hasChanged = Object.keys(dependencies).some(key => dependencies[key] !== prevDependencies.current[key]);

		if (hasChanged) {
			setIsRefreshing(true);
			prevDependencies.current = { ...dependencies };
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [depsString]);

	// Reset refreshing state when loading completes
	useEffect(() => {
		if (!loading && isRefreshing) {
			setIsRefreshing(false);
		}
	}, [loading, isRefreshing]);

	return isRefreshing;
}
