import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, useFlowExecutionsFilters } from './useFlowExecutionsFilters';

function renderFilters(initialUrl: string) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
	);
	return renderHook(
		() => ({
			filters: useFlowExecutionsFilters(),
			location: useLocation(),
		}),
		{ wrapper }
	);
}

describe('useFlowExecutionsFilters', () => {
	it('uses the defaults for a bare URL', () => {
		const { result } = renderFilters('/flow/executions');

		expect(result.current.filters.filters).toEqual({
			status: undefined,
			flow: undefined,
			page: 0,
			limit: DEFAULT_PAGE_SIZE,
		});
	});

	it('reads the filters and the zero-based page from the URL', () => {
		const { result } = renderFilters('/flow/executions?status=failed&flow=nightly&page=2&limit=50');

		expect(result.current.filters.filters).toEqual({ status: 'failed', flow: 'nightly', page: 2, limit: 50 });
	});

	it('ignores unrecognized URL values', () => {
		const { result } = renderFilters('/flow/executions?status=bogus&page=-3&limit=7');

		expect(result.current.filters.filters).toEqual({
			status: undefined,
			flow: undefined,
			page: 0,
			limit: DEFAULT_PAGE_SIZE,
		});
	});

	it('resets the page when the status changes', () => {
		const { result } = renderFilters('/flow/executions?page=3');

		act(() => {
			result.current.filters.setStatus('running');
		});

		expect(result.current.filters.filters.status).toBe('running');
		expect(result.current.filters.filters.page).toBe(0);
		expect(new URLSearchParams(result.current.location.search).get('page')).toBeNull();
	});

	it('resets the page when the flow changes and removes the param when cleared', () => {
		const { result } = renderFilters('/flow/executions?flow=a&page=1');

		act(() => {
			result.current.filters.setFlow('b');
		});
		expect(result.current.filters.filters).toMatchObject({ flow: 'b', page: 0 });

		act(() => {
			result.current.filters.setFlow(undefined);
		});
		expect(new URLSearchParams(result.current.location.search).has('flow')).toBe(false);
	});

	it('stores a non-zero page and drops the param for page 0', () => {
		const { result } = renderFilters('/flow/executions');

		act(() => {
			result.current.filters.setPage(4);
		});
		expect(result.current.filters.filters.page).toBe(4);

		act(() => {
			result.current.filters.setPage(0);
		});
		expect(new URLSearchParams(result.current.location.search).has('page')).toBe(false);
	});

	it('resets the page when the page size changes and keeps the other filters', () => {
		const { result } = renderFilters('/flow/executions?status=failed&page=2');

		act(() => {
			result.current.filters.setLimit(100);
		});

		expect(result.current.filters.filters).toEqual({ status: 'failed', flow: undefined, page: 0, limit: 100 });
	});
});
