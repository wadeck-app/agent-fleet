import type { StorageAdapter } from '@framework/storage/StorageAdapter';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLocalStorageState } from './useLocalStorageState';

/**
 * In-memory storage adapter for deterministic tests (no real localStorage)
 */
class InMemoryStorage implements StorageAdapter {
	private store = new Map<string, string>();

	isAvailable(): boolean {
		return true;
	}

	get<T>(key: string): T | null {
		const raw = this.store.get(key);
		if (raw === undefined) return null;
		return JSON.parse(raw) as T;
	}

	set<T>(key: string, value: T): boolean {
		this.store.set(key, JSON.stringify(value));
		return true;
	}

	remove(key: string): boolean {
		this.store.delete(key);
		return true;
	}

	clear(): void {
		this.store.clear();
	}
}

describe('useLocalStorageState', () => {
	let storage: InMemoryStorage;

	beforeEach(() => {
		storage = new InMemoryStorage();
	});

	it('should return default value when nothing is stored', () => {
		const { result } = renderHook(() => useLocalStorageState('key', 42, { storage }));
		expect(result.current[0]).toBe(42);
	});

	it('should return stored value when present', () => {
		storage.set('key', 100);
		const { result } = renderHook(() => useLocalStorageState('key', 42, { storage }));
		expect(result.current[0]).toBe(100);
	});

	it('should persist value on setState', () => {
		const { result } = renderHook(() => useLocalStorageState('key', 42, { storage }));

		act(() => {
			result.current[1](99);
		});

		expect(result.current[0]).toBe(99);
		expect(storage.get<number>('key')).toBe(99);
	});

	it('should support functional updates', () => {
		const { result } = renderHook(() => useLocalStorageState('key', 10, { storage }));

		act(() => {
			result.current[1](prev => prev + 5);
		});

		expect(result.current[0]).toBe(15);
		expect(storage.get<number>('key')).toBe(15);
	});

	it('should use default value when stored value fails validation', () => {
		storage.set('key', 'not-a-number');

		const isNumber = (v: unknown): v is number => typeof v === 'number';
		const { result } = renderHook(() => useLocalStorageState('key', 42, { storage, validate: isNumber }));

		expect(result.current[0]).toBe(42);
	});

	it('should accept stored value that passes validation', () => {
		storage.set('key', 200);

		const isNumber = (v: unknown): v is number => typeof v === 'number';
		const { result } = renderHook(() => useLocalStorageState('key', 42, { storage, validate: isNumber }));

		expect(result.current[0]).toBe(200);
	});

	it('should work with objects', () => {
		const defaultObj = { width: 250, collapsed: false };
		const { result } = renderHook(() => useLocalStorageState('layout', defaultObj, { storage }));

		act(() => {
			result.current[1]({ width: 400, collapsed: true });
		});

		expect(result.current[0]).toEqual({ width: 400, collapsed: true });
		expect(storage.get('layout')).toEqual({ width: 400, collapsed: true });
	});

	it('should work with strings', () => {
		const { result } = renderHook(() => useLocalStorageState('name', 'default', { storage }));

		act(() => {
			result.current[1]('updated');
		});

		expect(result.current[0]).toBe('updated');
		expect(storage.get<string>('name')).toBe('updated');
	});
});
