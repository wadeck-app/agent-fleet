/* global AbortSignal, AbortController */
import { type DependencyList, useEffect, useRef } from 'react';

/**
 * ===========================================================================================
 * USE ABORTABLE EFFECT - Race Condition Protection Hook
 * ===========================================================================================
 *
 * Generic hook to prevent race conditions in async operations.
 * Automatically cancels stale requests when dependencies change.
 *
 * Problem:
 * When a user types rapidly or navigates quickly, multiple async operations can be
 * triggered. If a slower request completes after a faster one, the displayed data
 * will be incorrect (showing results from an older request).
 *
 * Solution:
 * This hook uses AbortController to cancel pending operations when dependencies change.
 * Only the most recent operation's results will be processed.
 *
 * Example usage:
 * ```typescript
 * const [books, setBooks] = useState([]);
 * const [loading, setLoading] = useState(false);
 *
 * useAbortableEffect(
 *   async (signal) => {
 *     setLoading(true);
 *     const data = await fetchBooks(searchQuery);
 *
 *     // Only update state if not aborted
 *     if (!signal.aborted) {
 *       setBooks(data);
 *       setLoading(false);
 *     }
 *   },
 *   [searchQuery]
 * );
 * ```
 *
 * Key Features:
 * - Automatic cleanup: Previous operations are cancelled when dependencies change
 * - Signal access: Provides AbortSignal to check if operation was cancelled
 * - Type-safe: Full TypeScript support
 * - Zero dependencies: Uses only React and Web APIs
 *
 * ===========================================================================================
 */

export interface AbortableEffectCallback {
	/**
	 * Async function to execute
	 * @param signal - AbortSignal to check if operation was cancelled
	 */
	(signal: AbortSignal): Promise<void>;
}

/**
 * Hook that executes an async effect with race condition protection
 *
 * @param effect - Async function to execute. Receives an AbortSignal to check cancellation.
 * @param deps - Dependency array. Effect re-runs when dependencies change.
 *
 * @example
 * ```typescript
 * // Simple data fetching
 * useAbortableEffect(
 *   async (signal) => {
 *     const data = await api.fetch();
 *     if (!signal.aborted) {
 *       setState(data);
 *     }
 *   },
 *   [param1, param2]
 * );
 *
 * // With loading state
 * useAbortableEffect(
 *   async (signal) => {
 *     setLoading(true);
 *     try {
 *       const data = await api.fetch();
 *       if (!signal.aborted) {
 *         setState(data);
 *       }
 *     } finally {
 *       if (!signal.aborted) {
 *         setLoading(false);
 *       }
 *     }
 *   },
 *   [param1, param2]
 * );
 * ```
 */
export function useAbortableEffect(effect: AbortableEffectCallback, deps: DependencyList): void {
	// Store the effect in a ref to avoid recreation on every render
	// This prevents unnecessary effect re-runs
	const effectRef = useRef(effect);
	effectRef.current = effect;

	useEffect(() => {
		const abortController = new AbortController();

		// Execute the effect with the abort signal
		effectRef.current(abortController.signal);

		// Cleanup: abort when dependencies change
		return () => {
			abortController.abort();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
}
