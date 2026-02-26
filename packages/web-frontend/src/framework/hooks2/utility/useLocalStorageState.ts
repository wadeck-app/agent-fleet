import { useCallback, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';

interface UseLocalStorageStateOptions<T> {
	/**
	 * Custom storage adapter (defaults to localStorage).
	 * Useful for testing or alternative storage backends.
	 */
	storage?: StorageAdapter;
	/**
	 * Optional validation function. If it returns false, the stored value is
	 * discarded and `defaultValue` is used instead.
	 */
	validate?: (value: unknown) => value is T;
}

/**
 * React state hook that persists its value in localStorage.
 *
 * - Reads the stored value on first render (lazy initialiser)
 * - Falls back to `defaultValue` when nothing is stored or the value is invalid
 * - Writes to storage on every `setState` call
 * - SSR-safe (gracefully degrades to in-memory state)
 *
 * @param key        Unique localStorage key
 * @param defaultValue  Value used when nothing is stored
 * @param options    Optional storage adapter and validation
 */
export function useLocalStorageState<T>(
	key: string,
	defaultValue: T,
	options?: UseLocalStorageStateOptions<T>
): [T, (value: T | ((prev: T) => T)) => void] {
	const storage = options?.storage ?? defaultStorage;

	const [state, setStateInternal] = useState<T>(() => {
		const stored = storage.get<T>(key);
		if (stored === null) {
			return defaultValue;
		}
		if (options?.validate && !options.validate(stored)) {
			return defaultValue;
		}
		return stored;
	});

	const setState = useCallback(
		(value: T | ((prev: T) => T)) => {
			setStateInternal(prev => {
				const nextValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
				storage.set(key, nextValue);
				return nextValue;
			});
		},
		[key, storage]
	);

	return [state, setState];
}
