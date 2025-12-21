import type { StorageAdapter } from '@framework/storage/StorageAdapter';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePagination } from './usePagination';

// Mock storage adapter for testing
class MockStorageAdapter implements StorageAdapter {
	private storage = new Map<string, unknown>();

	get<T>(key: string): T | null {
		const value = this.storage.get(key);
		return value !== undefined ? (value as T) : null;
	}

	set<T>(key: string, value: T): boolean {
		this.storage.set(key, value);
		return true;
	}

	remove(key: string): boolean {
		return this.storage.delete(key);
	}

	isAvailable(): boolean {
		return true;
	}

	clear(): void {
		this.storage.clear();
	}
}

describe('usePagination', () => {
	let mockStorage: MockStorageAdapter;

	beforeEach(() => {
		mockStorage = new MockStorageAdapter();
	});

	describe('Basic Functionality', () => {
		it('should initialize with default values', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			expect(result.current.currentPage).toBe(1);
			expect(result.current.pageSize).toBe(10);
			expect(result.current.canGoPrevious).toBe(false);
		});

		it('should initialize with custom initial page', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10, initialPage: 5 }));

			expect(result.current.currentPage).toBe(5);
			expect(result.current.canGoPrevious).toBe(true);
		});
	});

	describe('Page Navigation', () => {
		it('should navigate to next page', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			act(() => {
				result.current.nextPage();
			});

			expect(result.current.currentPage).toBe(2);
		});

		it('should navigate to previous page', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10, initialPage: 5 }));

			act(() => {
				result.current.previousPage();
			});

			expect(result.current.currentPage).toBe(4);
		});

		it('should not go below page 1 when navigating previous', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			act(() => {
				result.current.previousPage();
			});

			expect(result.current.currentPage).toBe(1);
		});

		it('should set specific page', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			act(() => {
				result.current.setPage(7);
			});

			expect(result.current.currentPage).toBe(7);
		});

		it('should not set page below 1', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			act(() => {
				result.current.setPage(0);
			});

			expect(result.current.currentPage).toBe(1);

			act(() => {
				result.current.setPage(-5);
			});

			expect(result.current.currentPage).toBe(1);
		});

		it('should reset to initial page', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10, initialPage: 3 }));

			act(() => {
				result.current.setPage(10);
			});

			expect(result.current.currentPage).toBe(10);

			act(() => {
				result.current.resetPage();
			});

			expect(result.current.currentPage).toBe(3);
		});
	});

	describe('Page Size Management', () => {
		it('should update page size', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			expect(result.current.pageSize).toBe(10);

			act(() => {
				result.current.setPageSize(25);
			});

			expect(result.current.pageSize).toBe(25);
		});

		it('should reset to page 1 when page size changes', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			act(() => {
				result.current.setPage(5);
			});

			expect(result.current.currentPage).toBe(5);

			act(() => {
				result.current.setPageSize(50);
			});

			expect(result.current.currentPage).toBe(1);
			expect(result.current.pageSize).toBe(50);
		});

		it('should not set page size below 1', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			act(() => {
				result.current.setPageSize(0);
			});

			expect(result.current.pageSize).toBe(10);

			act(() => {
				result.current.setPageSize(-10);
			});

			expect(result.current.pageSize).toBe(10);
		});
	});

	describe('Storage Persistence', () => {
		it('should load page size from storage when storageId is provided', () => {
			mockStorage.set('books-pagination', { pageSize: 50 });

			const { result } = renderHook(() =>
				usePagination({ pageSize: 10, storageId: 'books', storage: mockStorage })
			);

			expect(result.current.pageSize).toBe(50);
		});

		it('should save page size to storage when it changes', () => {
			const { result } = renderHook(() =>
				usePagination({ pageSize: 10, storageId: 'books', storage: mockStorage })
			);

			act(() => {
				result.current.setPageSize(25);
			});

			const stored = mockStorage.get<{ pageSize: number }>('books-pagination');
			expect(stored).toEqual({ pageSize: 25 });
		});

		it('should not load from storage when storageId is not provided', () => {
			mockStorage.set('books-pagination', { pageSize: 50 });

			const { result } = renderHook(() => usePagination({ pageSize: 10, storage: mockStorage }));

			expect(result.current.pageSize).toBe(10);
		});

		it('should not save to storage when storageId is not provided', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10, storage: mockStorage }));

			act(() => {
				result.current.setPageSize(25);
			});

			const stored = mockStorage.get<{ pageSize: number }>('books-pagination');
			expect(stored).toBeNull();
		});

		it('should use initial pageSize when storage returns null', () => {
			const { result } = renderHook(() =>
				usePagination({ pageSize: 20, storageId: 'books', storage: mockStorage })
			);

			expect(result.current.pageSize).toBe(20);
		});
	});

	describe('canGoNext and canGoPrevious', () => {
		it('should report canGoPrevious correctly', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			expect(result.current.canGoPrevious).toBe(false);

			act(() => {
				result.current.nextPage();
			});

			expect(result.current.canGoPrevious).toBe(true);

			act(() => {
				result.current.previousPage();
			});

			expect(result.current.canGoPrevious).toBe(false);
		});

		it('should report canGoNext correctly with totalPages', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			expect(result.current.canGoNext(5)).toBe(true);

			act(() => {
				result.current.setPage(5);
			});

			expect(result.current.canGoNext(5)).toBe(false);
			expect(result.current.canGoNext(6)).toBe(true);
		});

		it('should allow next when totalPages is undefined', () => {
			const { result } = renderHook(() => usePagination({ pageSize: 10 }));

			expect(result.current.canGoNext()).toBe(true);

			act(() => {
				result.current.setPage(100);
			});

			expect(result.current.canGoNext()).toBe(true);
		});
	});
});
