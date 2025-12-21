import type { StorageAdapter } from './StorageAdapter';

/**
 * ===========================================================================================
 * LOCAL STORAGE ADAPTER
 * ===========================================================================================
 *
 * StorageAdapter implementation using browser localStorage.
 *
 * Features:
 * - Persistent storage across sessions
 * - SSR-safe (checks for window availability)
 * - Optional key prefix to avoid collisions
 * - Automatic JSON serialization/deserialization
 * - Error handling (returns null/false on errors, never throws)
 *
 * Limitations:
 * - ~5-10MB storage limit (browser-dependent)
 * - Synchronous API (may block on large data)
 * - Not available in private browsing mode (some browsers)
 * - Data persists even after browser close
 *
 * Usage:
 *   const storage = new LocalStorageAdapter();
 *   storage.set('user-prefs', { theme: 'dark' });
 *   const prefs = storage.get<UserPrefs>('user-prefs');
 *
 * ===========================================================================================
 */

export interface LocalStorageAdapterOptions {
	/** Prefix to prepend to all keys (useful for namespacing) */
	prefix?: string;
}

export class LocalStorageAdapter implements StorageAdapter {
	private readonly prefix: string;

	constructor(options?: LocalStorageAdapterOptions) {
		this.prefix = options?.prefix || '';
	}

	isAvailable(): boolean {
		return typeof window !== 'undefined' && !!window.localStorage;
	}

	get<T>(key: string): T | null {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			const fullKey = this.prefix + key;
			const item = localStorage.getItem(fullKey);
			if (item === null) {
				return null;
			}
			return JSON.parse(item) as T;
		} catch (error) {
			console.warn('[LocalStorageAdapter] Failed to get:', key, error);
			return null;
		}
	}

	set<T>(key: string, value: T): boolean {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const fullKey = this.prefix + key;
			localStorage.setItem(fullKey, JSON.stringify(value));
			return true;
		} catch (error) {
			console.warn('[LocalStorageAdapter] Failed to set:', key, error);
			return false;
		}
	}

	remove(key: string): boolean {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const fullKey = this.prefix + key;
			localStorage.removeItem(fullKey);
			return true;
		} catch (error) {
			console.warn('[LocalStorageAdapter] Failed to remove:', key, error);
			return false;
		}
	}
}

/**
 * Default storage instance using localStorage
 *
 * This is the default adapter used by hooks when no storage is explicitly provided.
 * Provides backward compatibility with existing code.
 */
export const defaultStorage = new LocalStorageAdapter();
