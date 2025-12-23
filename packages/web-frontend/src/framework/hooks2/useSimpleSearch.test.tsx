import { MemoryRouter } from 'react-router-dom';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSimpleSearch } from './useSimpleSearch';

describe('useSimpleSearch', () => {
	const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

	it('should initialize with empty query', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		expect(result.current.state.query).toBe('');
		expect(result.current.state.isEmpty).toBe(true);
	});

	it('should set query from URL params', () => {
		const { result } = renderHook(() => useSimpleSearch(), {
			wrapper: ({ children }) => <MemoryRouter initialEntries={['?q=chicken']}>{children}</MemoryRouter>,
		});

		expect(result.current.state.query).toBe('chicken');
		expect(result.current.state.isEmpty).toBe(false);
	});

	it('should update query when setQuery is called', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		act(() => {
			result.current.actions.setQuery('beef');
		});

		expect(result.current.state.query).toBe('beef');
		expect(result.current.state.isEmpty).toBe(false);
	});

	it('should trim whitespace from query', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		act(() => {
			result.current.actions.setQuery('  chicken  ');
		});

		expect(result.current.state.query).toBe('chicken');
	});

	it('should clear query when clearQuery is called', () => {
		const { result } = renderHook(() => useSimpleSearch(), {
			wrapper: ({ children }) => <MemoryRouter initialEntries={['?q=chicken']}>{children}</MemoryRouter>,
		});

		expect(result.current.state.query).toBe('chicken');

		act(() => {
			result.current.actions.clearQuery();
		});

		expect(result.current.state.query).toBe('');
		expect(result.current.state.isEmpty).toBe(true);
	});

	it('should remove URL param when clearing empty query', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		act(() => {
			result.current.actions.setQuery('beef');
		});

		expect(result.current.state.query).toBe('beef');

		act(() => {
			result.current.actions.clearQuery();
		});

		expect(result.current.state.query).toBe('');
	});

	it('should call onSearchChange callback when query changes', () => {
		const onSearchChange = vi.fn();
		const { result } = renderHook(() => useSimpleSearch({ onSearchChange }), { wrapper });

		act(() => {
			result.current.actions.setQuery('chicken');
		});

		expect(onSearchChange).toHaveBeenCalledTimes(1);
	});

	it('should call onSearchChange callback when query is cleared', () => {
		const onSearchChange = vi.fn();
		const { result } = renderHook(() => useSimpleSearch({ onSearchChange }), {
			wrapper: ({ children }) => <MemoryRouter initialEntries={['?q=chicken']}>{children}</MemoryRouter>,
		});

		act(() => {
			result.current.actions.clearQuery();
		});

		expect(onSearchChange).toHaveBeenCalledTimes(1);
	});

	it('should fillQuery with search param when query is non-empty', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		act(() => {
			result.current.actions.setQuery('chicken');
		});

		const queryObj: Record<string, unknown> = {};
		result.current.fillQuery(queryObj);

		expect(queryObj.search).toBe('chicken');
	});

	it('should NOT fillQuery when query is empty', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		const queryObj: Record<string, unknown> = {};
		result.current.fillQuery(queryObj);

		expect(queryObj.search).toBeUndefined();
	});

	it('should NOT fillQuery when query is whitespace-only', () => {
		const { result } = renderHook(() => useSimpleSearch(), { wrapper });

		act(() => {
			result.current.actions.setQuery('   ');
		});

		const queryObj: Record<string, unknown> = {};
		result.current.fillQuery(queryObj);

		expect(queryObj.search).toBeUndefined();
	});

	it('should have stable fstate reference', () => {
		const { result, rerender } = renderHook(() => useSimpleSearch(), { wrapper });

		const fstate1 = result.current.fstate;
		rerender();
		const fstate2 = result.current.fstate;

		expect(fstate1).toBe(fstate2);
	});
});
