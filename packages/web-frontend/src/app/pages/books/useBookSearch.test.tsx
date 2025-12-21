import type { ReactNode } from 'react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useBookSearch } from './useBookSearch';

/**
 * Wrapper component for testing hooks that use useSearchParams
 * Provides a MemoryRouter context with initial URL parameters
 */
function createWrapper(initialUrl = '/') {
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<MemoryRouter initialEntries={[initialUrl]}>
				<Routes>
					<Route path="*" element={<>{children}</>} />
				</Routes>
			</MemoryRouter>
		);
	};
}

describe('useBookSearch', () => {
	describe('URL Parameter Management', () => {
		it('should initialize with empty search when no URL param exists', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(result.current.searchQuery).toBe('');
		});

		it('should initialize with search from URL parameter', () => {
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(result.current.searchQuery).toBe('tolkien');
		});

		it('should initialize with search and preserve other URL params', () => {
			const wrapper = createWrapper('/books?page=2&search=tolkien&pageSize=20');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(result.current.searchQuery).toBe('tolkien');
		});

		it('should handle URL-encoded search parameters', () => {
			const wrapper = createWrapper('/books?search=the%20lord%20of%20rings');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(result.current.searchQuery).toBe('the lord of rings');
		});
	});

	describe('Search Operations', () => {
		it('should set search query and update URL', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('tolkien');
			});

			expect(result.current.searchQuery).toBe('tolkien');
		});

		it('should trim whitespace from search query', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('  tolkien  ');
			});

			expect(result.current.searchQuery).toBe('tolkien');
		});

		it('should remove URL param when search is cleared to empty string', () => {
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(result.current.searchQuery).toBe('tolkien');

			act(() => {
				result.current.setSearchQuery('');
			});

			expect(result.current.searchQuery).toBe('');
		});

		it('should remove URL param when search contains only whitespace', () => {
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('   ');
			});

			expect(result.current.searchQuery).toBe('');
		});

		it('should clear search using clearSearch method', () => {
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(result.current.searchQuery).toBe('tolkien');

			act(() => {
				result.current.clearSearch();
			});

			expect(result.current.searchQuery).toBe('');
		});

		it('should update existing search query', () => {
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('rowling');
			});

			expect(result.current.searchQuery).toBe('rowling');
		});
	});

	describe('Callback Integration', () => {
		it('should call onSearchChange when search query is set', () => {
			const onSearchChange = vi.fn();
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch({ onSearchChange }), { wrapper });

			act(() => {
				result.current.setSearchQuery('tolkien');
			});

			expect(onSearchChange).toHaveBeenCalledTimes(1);
		});

		it('should call onSearchChange when search is cleared', () => {
			const onSearchChange = vi.fn();
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch({ onSearchChange }), { wrapper });

			act(() => {
				result.current.clearSearch();
			});

			expect(onSearchChange).toHaveBeenCalledTimes(1);
		});

		it('should call onSearchChange when search is updated', () => {
			const onSearchChange = vi.fn();
			const wrapper = createWrapper('/books?search=tolkien');
			const { result } = renderHook(() => useBookSearch({ onSearchChange }), { wrapper });

			act(() => {
				result.current.setSearchQuery('rowling');
			});

			expect(onSearchChange).toHaveBeenCalledTimes(1);
		});

		it('should not throw when onSearchChange is not provided', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			expect(() => {
				act(() => {
					result.current.setSearchQuery('tolkien');
				});
			}).not.toThrow();
		});

		it('should call onSearchChange multiple times for multiple searches', () => {
			const onSearchChange = vi.fn();
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch({ onSearchChange }), { wrapper });

			act(() => {
				result.current.setSearchQuery('tolkien');
			});

			act(() => {
				result.current.setSearchQuery('rowling');
			});

			act(() => {
				result.current.clearSearch();
			});

			expect(onSearchChange).toHaveBeenCalledTimes(3);
		});
	});

	describe('Integration with Pagination Reset', () => {
		it('should simulate pagination reset on search change', () => {
			let currentPage = 5;
			const resetPagination = vi.fn(() => {
				currentPage = 1;
			});

			const wrapper = createWrapper('/books?page=5');
			const { result } = renderHook(() => useBookSearch({ onSearchChange: resetPagination }), { wrapper });

			expect(currentPage).toBe(5);

			act(() => {
				result.current.setSearchQuery('tolkien');
			});

			expect(resetPagination).toHaveBeenCalled();
			expect(currentPage).toBe(1);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty string search', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('');
			});

			expect(result.current.searchQuery).toBe('');
		});

		it('should handle special characters in search', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('café');
			});

			expect(result.current.searchQuery).toBe('café');
		});

		it('should handle very long search queries', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			const longQuery = 'a'.repeat(300);

			act(() => {
				result.current.setSearchQuery(longQuery);
			});

			// Note: Backend will truncate to 255 chars via BaseListQuerySchema
			expect(result.current.searchQuery).toBe(longQuery);
		});

		it('should handle search with multiple words', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('the lord of the rings');
			});

			expect(result.current.searchQuery).toBe('the lord of the rings');
		});

		it('should handle repeated spaces in search', () => {
			const wrapper = createWrapper('/books');
			const { result } = renderHook(() => useBookSearch(), { wrapper });

			act(() => {
				result.current.setSearchQuery('the    lord');
			});

			// Note: Backend will normalize whitespace via BaseListQuerySchema
			// Frontend just trims, doesn't normalize internal spaces
			expect(result.current.searchQuery).toBe('the    lord');
		});
	});

	describe('Hook Stability', () => {
		it('should maintain stable function references', () => {
			const wrapper = createWrapper('/books');
			const { result, rerender } = renderHook(() => useBookSearch(), {
				wrapper,
			});

			const firstSetSearchQuery = result.current.setSearchQuery;
			const firstClearSearch = result.current.clearSearch;

			rerender();

			expect(result.current.setSearchQuery).toBe(firstSetSearchQuery);
			expect(result.current.clearSearch).toBe(firstClearSearch);
		});

		it('should update callback when options change', () => {
			const wrapper = createWrapper('/books');
			const callback1 = vi.fn();
			const callback2 = vi.fn();

			const { result, rerender } = renderHook<ReturnType<typeof useBookSearch>, { onSearchChange: () => void }>(
				({ onSearchChange }) => useBookSearch({ onSearchChange }),
				{
					wrapper,
					initialProps: { onSearchChange: callback1 },
				}
			);

			act(() => {
				result.current.setSearchQuery('test1');
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(0);

			// Update the callback
			rerender({ onSearchChange: callback2 });

			act(() => {
				result.current.setSearchQuery('test2');
			});

			expect(callback1).toHaveBeenCalledTimes(1); // Not called again
			expect(callback2).toHaveBeenCalledTimes(1); // New callback called
		});
	});
});
