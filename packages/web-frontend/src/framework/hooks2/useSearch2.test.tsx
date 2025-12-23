import { MemoryRouter } from 'react-router-dom';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSearch2 } from './useSearch2';

// Helper to render hook with Router context
const renderWithRouter = (initialEntries: string[] = ['/']) => {
	return renderHook(() => useSearch2(), {
		wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>,
	});
};

describe('useSearch2', () => {
	describe('contract shape', () => {
		it('should return correct FeatureContract shape', () => {
			const { result } = renderWithRouter();

			expect(result.current).toHaveProperty('state');
			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			expect(result.current).toHaveProperty('fillQuery');
			expect(typeof result.current.fillQuery).toBe('function');
		});

		it('should have correct state shape', () => {
			const { result } = renderWithRouter();

			expect(result.current.state).toHaveProperty('query');
			expect(result.current.state).toHaveProperty('isEmpty');
			expect(typeof result.current.state.query).toBe('string');
			expect(typeof result.current.state.isEmpty).toBe('boolean');
		});

		it('should have correct actions shape', () => {
			const { result } = renderWithRouter();

			expect(result.current.actions).toHaveProperty('setQuery');
			expect(result.current.actions).toHaveProperty('clearQuery');
		});
	});

	describe('fstate stability', () => {
		it('should have stable fstate reference when state does not change', () => {
			const { result, rerender } = renderWithRouter();

			const firstFstate = result.current.fstate;
			rerender();
			const secondFstate = result.current.fstate;

			expect(firstFstate).toBe(secondFstate);
		});

		it('should update fstate reference when state changes', () => {
			const { result } = renderWithRouter();

			const firstFstate = result.current.fstate;

			act(() => {
				result.current.actions.setQuery('chicken');
			});

			const secondFstate = result.current.fstate;

			expect(firstFstate).not.toBe(secondFstate);
			expect(secondFstate.query).toBe('chicken');
		});
	});

	describe('fillQuery', () => {
		it('should not fill query when search is empty', () => {
			const { result } = renderWithRouter();

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({});
		});

		it('should fill search param when query has value', () => {
			const { result } = renderWithRouter(['/?search=chicken']);

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({ search: 'chicken' });
		});

		it('should not fill query when search is whitespace-only', () => {
			const { result } = renderWithRouter(['/?search=   ']);

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({});
		});
	});

	describe('URL parameter sync', () => {
		it('should read query from URL parameter', () => {
			const { result } = renderWithRouter(['/?search=chicken']);

			expect(result.current.state.query).toBe('chicken');
			expect(result.current.state.isEmpty).toBe(false);
		});

		it('should start with empty query when no URL parameter', () => {
			const { result } = renderWithRouter(['/']);

			expect(result.current.state.query).toBe('');
			expect(result.current.state.isEmpty).toBe(true);
		});

		it('should respect custom paramName', () => {
			const { result } = renderHook(() => useSearch2({ paramName: 'q' }), {
				wrapper: ({ children }) => <MemoryRouter initialEntries={['/?q=beef']}>{children}</MemoryRouter>,
			});

			expect(result.current.state.query).toBe('beef');
		});
	});

	describe('actions', () => {
		it('should setQuery and update URL', () => {
			const { result } = renderWithRouter();

			act(() => {
				result.current.actions.setQuery('chicken');
			});

			expect(result.current.state.query).toBe('chicken');
			expect(result.current.state.isEmpty).toBe(false);
		});

		it('should trim whitespace when setting query', () => {
			const { result } = renderWithRouter();

			act(() => {
				result.current.actions.setQuery('  chicken  ');
			});

			expect(result.current.state.query).toBe('chicken');
		});

		it('should remove URL parameter when setting empty query', () => {
			const { result } = renderWithRouter(['/?search=chicken']);

			expect(result.current.state.query).toBe('chicken');

			act(() => {
				result.current.actions.setQuery('');
			});

			expect(result.current.state.query).toBe('');
		});

		it('should clearQuery and remove URL parameter', () => {
			const { result } = renderWithRouter(['/?search=chicken']);

			expect(result.current.state.query).toBe('chicken');

			act(() => {
				result.current.actions.clearQuery();
			});

			expect(result.current.state.query).toBe('');
			expect(result.current.state.isEmpty).toBe(true);
		});
	});

	describe('isEmpty derived state', () => {
		it('should be true when query is empty', () => {
			const { result } = renderWithRouter();

			expect(result.current.state.isEmpty).toBe(true);
		});

		it('should be false when query has value', () => {
			const { result } = renderWithRouter(['/?search=chicken']);

			expect(result.current.state.isEmpty).toBe(false);
		});

		it('should be true for whitespace-only queries', () => {
			const { result } = renderWithRouter(['/?search=   ']);

			expect(result.current.state.isEmpty).toBe(true);
		});
	});

	describe('onSearchChange callback', () => {
		it('should call onSearchChange when query changes', () => {
			const onSearchChange = vi.fn();

			const { result } = renderHook(() => useSearch2({ onSearchChange }), {
				wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
			});

			act(() => {
				result.current.actions.setQuery('chicken');
			});

			expect(onSearchChange).toHaveBeenCalled();
		});

		it('should call onSearchChange when query is cleared', () => {
			const onSearchChange = vi.fn();

			const { result } = renderHook(() => useSearch2({ onSearchChange }), {
				wrapper: ({ children }) => (
					<MemoryRouter initialEntries={['/?search=chicken']}>{children}</MemoryRouter>
				),
			});

			act(() => {
				result.current.actions.clearQuery();
			});

			expect(onSearchChange).toHaveBeenCalled();
		});

		it('should not crash when onSearchChange is not provided', () => {
			const { result } = renderWithRouter();

			expect(() => {
				act(() => {
					result.current.actions.setQuery('chicken');
				});
			}).not.toThrow();
		});
	});

	describe('actions stability', () => {
		it('should have stable action references across re-renders', () => {
			const { result, rerender } = renderWithRouter();

			const firstActions = result.current.actions;
			rerender();
			const secondActions = result.current.actions;

			expect(firstActions).toBe(secondActions);
			expect(firstActions.setQuery).toBe(secondActions.setQuery);
			expect(firstActions.clearQuery).toBe(secondActions.clearQuery);
		});
	});
});
