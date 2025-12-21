import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
	let matchMediaMock: any;

	beforeEach(() => {
		matchMediaMock = {
			matches: false,
			media: '',
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};

		window.matchMedia = vi.fn().mockImplementation(query => ({
			...matchMediaMock,
			media: query,
		}));
	});

	it('should return false initially when media query does not match', () => {
		matchMediaMock.matches = false;
		const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
		expect(result.current).toBe(false);
	});

	it('should return true initially when media query matches', () => {
		matchMediaMock.matches = true;
		const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
		expect(result.current).toBe(true);
	});

	it('should add event listener on mount', () => {
		renderHook(() => useMediaQuery('(min-width: 768px)'));
		expect(matchMediaMock.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
	});

	it('should remove event listener on unmount', () => {
		const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
		unmount();
		expect(matchMediaMock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
	});

	it('should update when media query changes', () => {
		matchMediaMock.matches = false;
		const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

		expect(result.current).toBe(false);

		// Simulate media query change
		act(() => {
			const changeHandler = matchMediaMock.addEventListener.mock.calls[0][1];
			changeHandler({ matches: true });
		});

		expect(result.current).toBe(true);
	});

	it('should re-register listener when query changes', () => {
		const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
			initialProps: { query: '(min-width: 768px)' },
		});

		expect(matchMediaMock.addEventListener).toHaveBeenCalledTimes(1);

		rerender({ query: '(min-width: 1024px)' });

		expect(matchMediaMock.removeEventListener).toHaveBeenCalledTimes(1);
		expect(matchMediaMock.addEventListener).toHaveBeenCalledTimes(2);
	});
});
