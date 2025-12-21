import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearch } from './useSearch';

// Mock react-router-dom - use vi.hoisted to avoid hoisting issues
const mockUseSearchParams = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
	useSearchParams: mockUseSearchParams,
}));

describe('useSearch', () => {
	let searchParams: URLSearchParams;
	let setSearchParams: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		searchParams = new URLSearchParams();
		setSearchParams = vi.fn();

		mockUseSearchParams.mockReturnValue([searchParams, setSearchParams]);
	});

	describe('initialization', () => {
		it('should initialize with empty searchQuery', () => {
			const { result } = renderHook(() => useSearch());

			expect(result.current.searchQuery).toBe('');
		});

		it('should initialize with query from URL parameter', () => {
			searchParams.set('search', 'test query');

			const { result } = renderHook(() => useSearch());

			expect(result.current.searchQuery).toBe('test query');
		});

		it('should initialize with query from custom parameter name', () => {
			searchParams.set('q', 'custom query');

			const { result } = renderHook(() => useSearch({ paramName: 'q' }));

			expect(result.current.searchQuery).toBe('custom query');
		});

		it('should provide all required methods', () => {
			const { result } = renderHook(() => useSearch());

			expect(result.current.searchQuery).toBeDefined();
			expect(result.current.setSearchQuery).toBeInstanceOf(Function);
			expect(result.current.clearSearch).toBeInstanceOf(Function);
		});
	});

	describe('setSearchQuery', () => {
		it('should set search query in URL parameter', () => {
			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery('new query');

			expect(setSearchParams).toHaveBeenCalledWith(expect.any(Function), { replace: true });

			// Test the updater function
			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.get('search')).toBe('new query');
		});

		it('should trim search query before setting', () => {
			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery('  query with spaces  ');

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.get('search')).toBe('query with spaces');
		});

		it('should remove parameter when query is empty', () => {
			searchParams.set('search', 'existing query');

			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery('');

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.has('search')).toBe(false);
		});

		it('should remove parameter when query is only whitespace', () => {
			searchParams.set('search', 'existing query');

			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery('   ');

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.has('search')).toBe(false);
		});

		it('should preserve other URL parameters', () => {
			searchParams.set('page', '2');
			searchParams.set('sort', 'name');

			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery('new query');

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.get('search')).toBe('new query');
			expect(newParams.get('page')).toBe('2');
			expect(newParams.get('sort')).toBe('name');
		});

		it('should use custom parameter name', () => {
			const { result } = renderHook(() => useSearch({ paramName: 'q' }));

			result.current.setSearchQuery('custom query');

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.get('q')).toBe('custom query');
			expect(newParams.has('search')).toBe(false);
		});

		it('should call onSearchChange callback', () => {
			const onSearchChange = vi.fn();
			const { result } = renderHook(() => useSearch({ onSearchChange }));

			result.current.setSearchQuery('query');

			expect(onSearchChange).toHaveBeenCalledOnce();
		});

		it('should call onSearchChange even when clearing', () => {
			const onSearchChange = vi.fn();
			const { result } = renderHook(() => useSearch({ onSearchChange }));

			result.current.setSearchQuery('');

			expect(onSearchChange).toHaveBeenCalledOnce();
		});

		it('should not call onSearchChange when not provided', () => {
			const { result } = renderHook(() => useSearch());

			// Should not throw
			expect(() => result.current.setSearchQuery('query')).not.toThrow();
		});
	});

	describe('clearSearch', () => {
		it('should clear search query', () => {
			searchParams.set('search', 'existing query');

			const { result } = renderHook(() => useSearch());

			result.current.clearSearch();

			expect(setSearchParams).toHaveBeenCalled();
			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.has('search')).toBe(false);
		});

		it('should call onSearchChange callback', () => {
			const onSearchChange = vi.fn();
			const { result } = renderHook(() => useSearch({ onSearchChange }));

			result.current.clearSearch();

			expect(onSearchChange).toHaveBeenCalledOnce();
		});

		it('should be idempotent', () => {
			const { result } = renderHook(() => useSearch());

			result.current.clearSearch();
			result.current.clearSearch();

			expect(setSearchParams).toHaveBeenCalledTimes(2);
		});

		it('should preserve other URL parameters', () => {
			searchParams.set('search', 'query');
			searchParams.set('page', '2');

			const { result } = renderHook(() => useSearch());

			result.current.clearSearch();

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.has('search')).toBe(false);
			expect(newParams.get('page')).toBe('2');
		});
	});

	describe('paramName option', () => {
		it('should use default parameter name "search"', () => {
			searchParams.set('search', 'default');

			const { result } = renderHook(() => useSearch());

			expect(result.current.searchQuery).toBe('default');
		});

		it('should use custom parameter name', () => {
			searchParams.set('q', 'custom');

			const { result } = renderHook(() => useSearch({ paramName: 'q' }));

			expect(result.current.searchQuery).toBe('custom');
		});

		it('should not read from default parameter when using custom name', () => {
			searchParams.set('search', 'default');
			searchParams.set('query', 'custom');

			const { result } = renderHook(() => useSearch({ paramName: 'query' }));

			expect(result.current.searchQuery).toBe('custom');
		});

		it('should handle different parameter names independently', () => {
			searchParams.set('search', 'search-value');
			searchParams.set('filter', 'filter-value');

			const { result: result1 } = renderHook(() => useSearch());
			const { result: result2 } = renderHook(() => useSearch({ paramName: 'filter' }));

			expect(result1.current.searchQuery).toBe('search-value');
			expect(result2.current.searchQuery).toBe('filter-value');
		});
	});

	describe('integration scenarios', () => {
		it('should integrate with pagination reset', () => {
			const setPage = vi.fn();
			const { result } = renderHook(() =>
				useSearch({
					onSearchChange: () => setPage(1),
				})
			);

			result.current.setSearchQuery('new search');

			expect(setPage).toHaveBeenCalledWith(1);
		});

		it('should handle very long queries', () => {
			const longQuery = 'a'.repeat(1000);

			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery(longQuery);

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.get('search')).toBe(longQuery);
		});

		it('should handle unicode characters', () => {
			const unicodeQuery = '你好 世界 🌍';

			const { result } = renderHook(() => useSearch());

			result.current.setSearchQuery(unicodeQuery);

			const updater = setSearchParams.mock.calls[0]![0];
			const newParams = updater(searchParams);
			expect(newParams.get('search')).toBe(unicodeQuery);
		});
	});
});
