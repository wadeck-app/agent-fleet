import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCategoryFilter2 } from './useCategoryFilter2';

const CATEGORIES = ['Protein', 'Vegetable', 'Fruit', 'Grain', 'Dairy'];

describe('useCategoryFilter2', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	describe('contract shape', () => {
		it('should return correct FeatureContract shape', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			expect(result.current).toHaveProperty('fillQuery');
			expect(typeof result.current.fillQuery).toBe('function');
		});

		it('should have correct state shape', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			expect(result.current.fstate).toHaveProperty('value');
			expect(result.current.fstate).toHaveProperty('options');
			expect(Array.isArray(result.current.fstate.options)).toBe(true);
		});

		it('should have correct actions shape', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			expect(result.current.actions).toHaveProperty('setValue');
			expect(result.current.actions).toHaveProperty('clearValue');
		});
	});

	describe('fstate stability', () => {
		it('should have stable fstate reference when state does not change', () => {
			const { result, rerender } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			const firstFstate = result.current.fstate;
			rerender();
			const secondFstate = result.current.fstate;

			expect(firstFstate).toBe(secondFstate);
		});

		it('should update fstate reference when state changes', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			const firstFstate = result.current.fstate;

			act(() => {
				result.current.actions.setValue('Protein');
			});

			const secondFstate = result.current.fstate;

			expect(firstFstate).not.toBe(secondFstate);
			expect(secondFstate.value).toBe('Protein');
		});
	});

	describe('fillQuery', () => {
		it('should not fill query when value is null', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({});
		});

		it('should fill category param when value is set', () => {
			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, defaultCategory: 'Protein' })
			);

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({ category: 'Protein' });
		});

		it('should fill updated query after setValue', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			act(() => {
				result.current.actions.setValue('Vegetable');
			});

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({ category: 'Vegetable' });
		});
	});

	describe('localStorage persistence', () => {
		it('should persist value to localStorage', () => {
			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, storageId: 'test-items' })
			);

			act(() => {
				result.current.actions.setValue('Protein');
			});

			const stored = localStorage.getItem('test-items-category-filter');
			expect(stored).toBe('"Protein"');
		});

		it('should load value from localStorage on init', () => {
			// Pre-populate localStorage
			localStorage.setItem('test-items-category-filter', JSON.stringify('Vegetable'));

			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, storageId: 'test-items' })
			);

			expect(result.current.fstate.value).toBe('Vegetable');
		});

		it('should remove value from localStorage when cleared', () => {
			const { result } = renderHook(() =>
				useCategoryFilter2({
					categories: CATEGORIES,
					storageId: 'test-items',
					defaultCategory: 'Protein',
				})
			);

			act(() => {
				result.current.actions.clearValue();
			});

			const stored = localStorage.getItem('test-items-category-filter');
			expect(stored).toBeNull();
		});

		it('should not persist when storageId is not provided', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			act(() => {
				result.current.actions.setValue('Protein');
			});

			expect(localStorage.length).toBe(0);
		});

		it('should ignore invalid stored value', () => {
			// Pre-populate localStorage with invalid category
			localStorage.setItem('test-items-category-filter', JSON.stringify('InvalidCategory'));

			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, storageId: 'test-items' })
			);

			// Should fall back to defaultCategory (null)
			expect(result.current.fstate.value).toBeNull();
		});
	});

	describe('actions', () => {
		it('should setValue correctly', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			act(() => {
				result.current.actions.setValue('Protein');
			});

			expect(result.current.fstate.value).toBe('Protein');
		});

		it('should clearValue correctly', () => {
			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, defaultCategory: 'Protein' })
			);

			expect(result.current.fstate.value).toBe('Protein');

			act(() => {
				result.current.actions.clearValue();
			});

			expect(result.current.fstate.value).toBeNull();
		});

		it('should reject invalid category value', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			act(() => {
				result.current.actions.setValue('InvalidCategory');
			});

			expect(result.current.fstate.value).toBeNull();
			expect(consoleWarnSpy).toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});

		it('should allow setting null value', () => {
			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, defaultCategory: 'Protein' })
			);

			expect(result.current.fstate.value).toBe('Protein');

			act(() => {
				result.current.actions.setValue(null);
			});

			expect(result.current.fstate.value).toBeNull();
		});
	});

	describe('state.options', () => {
		it('should expose available categories as options', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			expect(result.current.fstate.options).toEqual(CATEGORIES);
		});

		it('should update options when categories change', () => {
			const { result, rerender } = renderHook(({ categories }) => useCategoryFilter2({ categories }), {
				initialProps: { categories: CATEGORIES },
			});

			const newCategories = ['Spice', 'Oil'];
			rerender({ categories: newCategories });

			expect(result.current.fstate.options).toEqual(newCategories);
		});
	});

	describe('defaultCategory option', () => {
		it('should start with defaultCategory when provided', () => {
			const { result } = renderHook(() =>
				useCategoryFilter2({ categories: CATEGORIES, defaultCategory: 'Protein' })
			);

			expect(result.current.fstate.value).toBe('Protein');
		});

		it('should start with null when defaultCategory not provided', () => {
			const { result } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			expect(result.current.fstate.value).toBeNull();
		});

		it('should prioritize localStorage over defaultCategory', () => {
			// Pre-populate localStorage
			localStorage.setItem('test-items-category-filter', JSON.stringify('Vegetable'));

			const { result } = renderHook(() =>
				useCategoryFilter2({
					categories: CATEGORIES,
					storageId: 'test-items',
					defaultCategory: 'Protein',
				})
			);

			// Should use localStorage value, not defaultCategory
			expect(result.current.fstate.value).toBe('Vegetable');
		});
	});

	describe('actions stability', () => {
		it('should have stable action references across re-renders', () => {
			const { result, rerender } = renderHook(() => useCategoryFilter2({ categories: CATEGORIES }));

			const firstActions = result.current.actions;
			rerender();
			const secondActions = result.current.actions;

			expect(firstActions).toBe(secondActions);
			expect(firstActions.setValue).toBe(secondActions.setValue);
			expect(firstActions.clearValue).toBe(secondActions.clearValue);
		});
	});
});
