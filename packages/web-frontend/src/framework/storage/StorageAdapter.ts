/**
 * ===========================================================================================
 * STORAGE ADAPTER - Interface
 * ===========================================================================================
 *
 * Generic interface for storage implementations.
 * Allows abstracting away storage details (localStorage, cookies, backend, etc.)
 *
 * Features:
 * - Type-safe generic get/set operations
 * - Error handling at implementation level (never throws)
 * - SSR-safe checks via isAvailable()
 * - Consistent API across all storage backends
 *
 * Usage:
 *   const storage = new LocalStorageAdapter();
 *   storage.set('key', { foo: 'bar' });
 *   const data = storage.get<MyType>('key');
 *
 * ===========================================================================================
 */

export interface StorageAdapter {
	/**
	 * Get value from storage
	 *
	 * @param key - Storage key
	 * @returns Parsed value or null if not found/error
	 * @template T - Expected type of the stored value
	 */
	get<T>(key: string): T | null;

	/**
	 * Set value in storage
	 *
	 * @param key - Storage key
	 * @param value - Value to store (will be JSON serialized)
	 * @returns true if successful, false otherwise
	 * @template T - Type of value to store
	 */
	set<T>(key: string, value: T): boolean;

	/**
	 * Remove value from storage
	 *
	 * @param key - Storage key
	 * @returns true if successful, false otherwise
	 */
	remove(key: string): boolean;

	/**
	 * Check if storage is available
	 *
	 * @returns true if storage can be used (SSR-safe)
	 */
	isAvailable(): boolean;
}
