import { type DependencyList, useState } from 'react';

import { useAbortableEffect } from './useAbortableEffect';

/**
 * ===========================================================================================
 * USE ASYNC DATA - High-Level Race Condition Protection Hook
 * ===========================================================================================
 *
 * A higher-level abstraction over useAbortableEffect that eliminates boilerplate
 * and automatically protects against race conditions in async data fetching.
 *
 * Problem Solved:
 * When using useAbortableEffect directly, developers must remember to check
 * signal.aborted before every state update. This is error-prone and repetitive.
 *
 * Solution:
 * This hook encapsulates the entire pattern of loading/error/data state management
 * with automatic race condition protection. You can't forget to check signal.aborted
 * because the hook handles it internally.
 *
 * Example usage:
 * ```typescript
 * // Before: Lots of boilerplate with manual signal.aborted checks
 * const [books, setBooks] = useState([]);
 * const [loading, setLoading] = useState(false);
 * const [error, setError] = useState(null);
 *
 * useAbortableEffect(
 *   async (signal) => {
 *     setLoading(true);
 *     setError(null);
 *     try {
 *       const data = await fetchBooks(query);
 *       if (!signal.aborted) {
 *         setBooks(data);
 *       }
 *     } catch (err) {
 *       if (!signal.aborted) {
 *         setError(err);
 *       }
 *     } finally {
 *       if (!signal.aborted) {
 *         setLoading(false);
 *       }
 *     }
 *   },
 *   [query]
 * );
 *
 * // After: Clean and concise
 * const { data: books, loading, error } = useAsyncData(
 *   () => fetchBooks(query),
 *   [query]
 * );
 * ```
 *
 * Key Features:
 * - Automatic race condition protection (uses useAbortableEffect internally)
 * - Loading state management
 * - Error handling
 * - Zero boilerplate
 * - Type-safe with full TypeScript support
 * - Impossible to forget signal.aborted checks
 *
 * ===========================================================================================
 */

export interface UseAsyncDataOptions {
	/**
	 * Whether to set loading to true immediately or wait for the first fetch
	 * @default false - starts with loading: false to avoid flash of loading state on mount
	 */
	initialLoading?: boolean;
}

export interface UseAsyncDataResult<T> {
	/**
	 * The fetched data, or null if not yet loaded
	 */
	data: T | null;

	/**
	 * Whether a fetch operation is in progress
	 */
	loading: boolean;

	/**
	 * Error that occurred during fetch, or null if no error
	 */
	error: Error | null;
}

/**
 * Hook that fetches async data with automatic race condition protection
 *
 * @param fetchFn - Async function that fetches data. Called whenever dependencies change.
 * @param deps - Dependency array. Effect re-runs when dependencies change.
 * @param options - Optional configuration
 * @returns Object containing data, loading state, and error
 *
 * @example
 * ```typescript
 * // Simple data fetching
 * const { data, loading, error } = useAsyncData(
 *   () => api.getBooks({ search: query }),
 *   [query]
 * );
 *
 * // With error handling in component
 * const { data, loading, error } = useAsyncData(
 *   () => api.getUsers(userId),
 *   [userId]
 * );
 *
 * if (error) return <ErrorMessage error={error} />;
 * if (loading) return <Spinner />;
 * return <DataView data={data} />;
 *
 * // Autocomplete with debouncing
 * const [query, setQuery] = useState('');
 * const debouncedQuery = useDebouncedValue(query, 300);
 * const { data: results, loading } = useAsyncData(
 *   () => api.search(debouncedQuery),
 *   [debouncedQuery]
 * );
 * ```
 */
export function useAsyncData<T>(
	fetchFn: () => Promise<T>,
	deps: DependencyList,
	options?: UseAsyncDataOptions
): UseAsyncDataResult<T> {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(options?.initialLoading ?? false);
	const [error, setError] = useState<Error | null>(null);

	useAbortableEffect(async signal => {
		setLoading(true);
		setError(null);

		try {
			const result = await fetchFn();

			// Only update state if request wasn't aborted
			if (!signal.aborted) {
				setData(result);
			}
		} catch (err) {
			// Only update error state if request wasn't aborted
			if (!signal.aborted) {
				setError(err instanceof Error ? err : new Error(String(err)));
			}
		} finally {
			// Only update loading state if request wasn't aborted
			if (!signal.aborted) {
				setLoading(false);
			}
		}
	}, deps);

	return { data, loading, error };
}
