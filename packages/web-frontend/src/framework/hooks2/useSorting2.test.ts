import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSorting2 } from './useSorting2';

describe('useSorting2', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	describe('contract shape', () => {
		it('should return correct FeatureContract shape', () => {
			const { result } = renderHook(() => useSorting2());

			expect(result.current).toHaveProperty('state');
			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			expect(result.current).toHaveProperty('fillQuery');
			expect(typeof result.current.fillQuery).toBe('function');
		});

		it('should have correct state shape', () => {
			const { result } = renderHook(() => useSorting2());

			expect(result.current.fstate).toHaveProperty('sortConfigs');
			expect(result.current.fstate).toHaveProperty('getSortInfo');
			expect(Array.isArray(result.current.fstate.sortConfigs)).toBe(true);
			expect(typeof result.current.fstate.getSortInfo).toBe('function');
		});

		it('should have correct actions shape', () => {
			const { result } = renderHook(() => useSorting2());

			expect(result.current.actions).toHaveProperty('handleSort');
			expect(result.current.actions).toHaveProperty('clearSort');
			expect(result.current.actions).toHaveProperty('setSortConfigs');
		});
	});

	describe('fstate stability', () => {
		it('should have stable fstate reference when state does not change', () => {
			const { result, rerender } = renderHook(() => useSorting2());

			const firstFstate = result.current.fstate;
			rerender();
			const secondFstate = result.current.fstate;

			expect(firstFstate).toBe(secondFstate);
		});

		it('should update fstate reference when state changes', () => {
			const { result } = renderHook(() => useSorting2());

			const firstFstate = result.current.fstate;

			act(() => {
				result.current.actions.handleSort('name', false);
			});

			const secondFstate = result.current.fstate;

			expect(firstFstate).not.toBe(secondFstate);
			expect(secondFstate.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);
		});
	});

	describe('fillQuery', () => {
		it('should not fill query when no sorting', () => {
			const { result } = renderHook(() => useSorting2());

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({});
		});

		it('should fill query correctly for single sort', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
			});

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({
				sortBy: 'name',
				sortOrder: 'asc',
			});
		});

		it('should fill query correctly for multi-sort', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true); // shift+click
			});

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({
				sortBy: 'name,createdAt',
				sortOrder: 'asc,asc',
			});
		});
	});

	describe('localStorage persistence', () => {
		it('should persist sortConfigs to localStorage', () => {
			const { result } = renderHook(() => useSorting2({ storageId: 'test-table' }));

			act(() => {
				result.current.actions.handleSort('name', false);
			});

			const stored = localStorage.getItem('test-table-sorting');
			expect(stored).toBeTruthy();
			expect(JSON.parse(stored!)).toEqual([{ key: 'name', direction: 'asc' }]);
		});

		it('should load sortConfigs from localStorage on init', () => {
			// Pre-populate localStorage
			localStorage.setItem('test-table-sorting', JSON.stringify([{ key: 'name', direction: 'desc' }]));

			const { result } = renderHook(() => useSorting2({ storageId: 'test-table' }));

			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'name', direction: 'desc' }]);
		});

		it('should not persist when storageId is not provided', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
			});

			expect(localStorage.length).toBe(0);
		});
	});

	describe('single-column sorting (regular click)', () => {
		it('should set asc on first click', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
			});

			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);
		});

		it('should cycle to desc on second click', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('name', false);
			});

			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'name', direction: 'desc' }]);
		});

		it('should cycle to none (empty) on third click', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('name', false);
			});

			expect(result.current.fstate.sortConfigs).toEqual([]);
		});

		it('should replace existing sort when clicking different column', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', false);
			});

			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'createdAt', direction: 'asc' }]);
		});
	});

	describe('multi-column sorting (shift+click)', () => {
		it('should add secondary sort with shift+click', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true); // shift+click
			});

			expect(result.current.fstate.sortConfigs).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'createdAt', direction: 'asc' },
			]);
		});

		it('should cycle secondary sort: asc -> desc -> remove', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true); // Add secondary
			});

			expect(result.current.fstate.sortConfigs).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'createdAt', direction: 'asc' },
			]);

			act(() => {
				result.current.actions.handleSort('createdAt', true); // Cycle to desc
			});

			expect(result.current.fstate.sortConfigs).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'createdAt', direction: 'desc' },
			]);

			act(() => {
				result.current.actions.handleSort('createdAt', true); // Remove
			});

			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);
		});

		it('should preserve other sorts when removing one', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true);
				result.current.actions.handleSort('updatedAt', true);
			});

			expect(result.current.fstate.sortConfigs).toHaveLength(3);

			act(() => {
				// Remove middle sort
				result.current.actions.handleSort('createdAt', true); // asc->desc
				result.current.actions.handleSort('createdAt', true); // desc->remove
			});

			expect(result.current.fstate.sortConfigs).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'updatedAt', direction: 'asc' },
			]);
		});

		it('should respect multiColumn: false option', () => {
			const { result } = renderHook(() => useSorting2({ multiColumn: false }));

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true); // shift+click ignored
			});

			// Should replace, not add
			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'createdAt', direction: 'asc' }]);
		});
	});

	describe('getSortInfo', () => {
		it('should return null when column not sorted', () => {
			const { result } = renderHook(() => useSorting2());

			const info = result.current.fstate.getSortInfo('name');

			expect(info).toEqual({ direction: null, priority: null });
		});

		it('should return direction without priority for single sort', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
			});

			const info = result.current.fstate.getSortInfo('name');

			expect(info).toEqual({ direction: 'asc', priority: null });
		});

		it('should return direction with priority for multi-sort', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true);
			});

			const nameInfo = result.current.fstate.getSortInfo('name');
			const createdAtInfo = result.current.fstate.getSortInfo('createdAt');

			expect(nameInfo).toEqual({ direction: 'asc', priority: 1 });
			expect(createdAtInfo).toEqual({ direction: 'asc', priority: 2 });
		});
	});

	describe('actions', () => {
		it('should clearSort', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.handleSort('name', false);
				result.current.actions.handleSort('createdAt', true);
				result.current.actions.clearSort();
			});

			expect(result.current.fstate.sortConfigs).toEqual([]);
		});

		it('should setSortConfigs directly', () => {
			const { result } = renderHook(() => useSorting2());

			act(() => {
				result.current.actions.setSortConfigs([
					{ key: 'name', direction: 'desc' },
					{ key: 'createdAt', direction: 'asc' },
				]);
			});

			expect(result.current.fstate.sortConfigs).toEqual([
				{ key: 'name', direction: 'desc' },
				{ key: 'createdAt', direction: 'asc' },
			]);
		});
	});

	describe('defaultSort option', () => {
		it('should start with defaultSort when provided', () => {
			const { result } = renderHook(() =>
				useSorting2({
					defaultSort: [{ key: 'name', direction: 'asc' }],
				})
			);

			expect(result.current.fstate.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);
		});

		it('should start with empty array when defaultSort not provided', () => {
			const { result } = renderHook(() => useSorting2());

			expect(result.current.fstate.sortConfigs).toEqual([]);
		});
	});

	describe('actions stability', () => {
		it('should have stable action references across re-renders', () => {
			const { result, rerender } = renderHook(() => useSorting2());

			const firstActions = result.current.actions;
			rerender();
			const secondActions = result.current.actions;

			expect(firstActions).toBe(secondActions);
			expect(firstActions.handleSort).toBe(secondActions.handleSort);
			expect(firstActions.clearSort).toBe(secondActions.clearSort);
		});
	});
});
