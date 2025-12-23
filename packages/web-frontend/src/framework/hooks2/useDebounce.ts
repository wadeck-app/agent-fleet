import { useEffect, useState } from 'react';

/**
 * ===========================================================================================
 * USE DEBOUNCE - Generic Debounce Hook
 * ===========================================================================================
 *
 * Delays updating a value until after a specified time has elapsed without changes.
 * Useful for search inputs, auto-save, and other operations that shouldn't fire on every change.
 *
 * Example usage:
 * ```typescript
 * const [searchInput, setSearchInput] = useState('');
 * const debouncedSearch = useDebounce(searchInput, 300);
 *
 * // debouncedSearch updates 300ms after user stops typing
 * useEffect(() => {
 *   console.log('Searching for:', debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 *
 * ===========================================================================================
 */

/**
 * Debounce a value, returning the debounced version.
 * Updates only after the specified delay has passed without changes.
 *
 * @template T - Type of value to debounce
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		// Set up timer to update debounced value after delay
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		// Clean up timer if value changes before delay expires
		return () => clearTimeout(handler);
	}, [value, delay]);

	return debouncedValue;
}
