import type { StorageAdapter } from './StorageAdapter';

/**
 * ===========================================================================================
 * COOKIE ADAPTER
 * ===========================================================================================
 *
 * StorageAdapter implementation using browser cookies.
 *
 * Features:
 * - Persistent storage with expiration (maxAge)
 * - Configurable path, sameSite, and secure attributes
 * - SSR-safe (checks for document availability)
 * - Optional key prefix to avoid collisions
 * - Automatic URL encoding/decoding for special characters
 * - Automatic JSON serialization/deserialization
 *
 * Limitations:
 * - ~4KB per cookie (browser limit)
 * - Cookies sent with EVERY HTTP request (adds overhead)
 * - NOT HttpOnly (accessible from JavaScript - less secure than server-set cookies)
 * - SameSite=None requires secure=true (HTTPS only)
 *
 * Security Note:
 * - Cookies created via document.cookie are NEVER HttpOnly
 * - For truly secure cookies, use server-side cookie setting (Set-Cookie header)
 * - Suitable for non-sensitive user preferences only
 *
 * Usage:
 *   const storage = new CookieAdapter({
 *     prefix: 'app_',
 *     maxAge: 30 * 24 * 60 * 60 // 30 days
 *   });
 *   storage.set('theme', 'dark');
 *   const theme = storage.get<string>('theme');
 *
 * ===========================================================================================
 */

export interface CookieAdapterOptions {
	/** Prefix to prepend to all keys (useful for namespacing) */
	prefix?: string;
	/** Cookie expiration in seconds (default: 1 year) */
	maxAge?: number;
	/** Cookie path (default: '/') */
	path?: string;
	/** SameSite attribute (default: 'Lax') */
	sameSite?: 'Strict' | 'Lax' | 'None';
	/** Secure attribute - HTTPS only (default: true in production) */
	secure?: boolean;
}

export class CookieAdapter implements StorageAdapter {
	private readonly prefix: string;
	private readonly maxAge: number;
	private readonly path: string;
	private readonly sameSite: 'Strict' | 'Lax' | 'None';
	private readonly secure: boolean;

	constructor(options?: CookieAdapterOptions) {
		this.prefix = options?.prefix || '';
		this.maxAge = options?.maxAge || 365 * 24 * 60 * 60; // 1 year by default
		this.path = options?.path || '/';
		this.sameSite = options?.sameSite || 'Lax';
		this.secure = options?.secure ?? import.meta.env.PROD;
	}

	isAvailable(): boolean {
		return typeof document !== 'undefined' && document.cookie !== undefined;
	}

	get<T>(key: string): T | null {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			const fullKey = this.prefix + key;
			const name = encodeURIComponent(fullKey) + '=';
			const cookies = document.cookie.split(';');

			for (const cookie of cookies) {
				const c = cookie.trim();
				if (c.startsWith(name)) {
					const value = decodeURIComponent(c.substring(name.length));
					return JSON.parse(value) as T;
				}
			}

			return null;
		} catch (error) {
			console.warn('[CookieAdapter] Failed to get:', key, error);
			return null;
		}
	}

	set<T>(key: string, value: T): boolean {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const fullKey = this.prefix + key;
			const cookieName = encodeURIComponent(fullKey);
			const cookieValue = encodeURIComponent(JSON.stringify(value));

			const parts = [
				`${cookieName}=${cookieValue}`,
				`max-age=${this.maxAge}`,
				`path=${this.path}`,
				`samesite=${this.sameSite}`,
			];

			if (this.secure) {
				parts.push('secure');
			}

			document.cookie = parts.join('; ');
			return true;
		} catch (error) {
			console.warn('[CookieAdapter] Failed to set:', key, error);
			return false;
		}
	}

	remove(key: string): boolean {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const fullKey = this.prefix + key;
			const cookieName = encodeURIComponent(fullKey);
			// Set max-age=0 to immediately expire the cookie
			document.cookie = `${cookieName}=; max-age=0; path=${this.path}`;
			return true;
		} catch (error) {
			console.warn('[CookieAdapter] Failed to remove:', key, error);
			return false;
		}
	}
}
