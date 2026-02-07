import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useListItems } from './useListItems';

describe('useListItems', () => {
	interface TestItem {
		id: string;
		value: string;
	}

	beforeEach(() => {
		// Reset any state if needed
	});

	describe('contract shape', () => {
		it('should return correct FeatureFormContract shape', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			// FeatureFormContract does NOT have fillQuery (form-only hooks)
			expect(result.current).not.toHaveProperty('fillQuery');
		});

		it('should have correct fstate shape', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			expect(result.current.fstate).toEqual({
				items: [],
				count: 0,
				isEmpty: true,
				canAdd: true,
				canRemove: false,
			});
		});

		it('should have correct actions shape', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			expect(result.current.actions).toHaveProperty('add');
			expect(result.current.actions).toHaveProperty('remove');
			expect(result.current.actions).toHaveProperty('update');
			expect(result.current.actions).toHaveProperty('set');
			expect(result.current.actions).toHaveProperty('clear');
			expect(result.current.actions).toHaveProperty('reorder');
		});
	});

	describe('fstate stability', () => {
		it('should have stable fstate reference when state does not change', () => {
			const { result, rerender } = renderHook(() => useListItems<TestItem>());

			const firstFstate = result.current.fstate;
			rerender();
			const secondFstate = result.current.fstate;

			expect(firstFstate).toBe(secondFstate);
		});

		it('should update fstate reference when items change', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			const firstFstate = result.current.fstate;

			act(() => {
				result.current.actions.add({ id: '1', value: 'test' });
			});

			const secondFstate = result.current.fstate;

			expect(firstFstate).not.toBe(secondFstate);
		});
	});

	describe('initialization', () => {
		it('should initialize with empty list by default', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			expect(result.current.fstate.items).toEqual([]);
			expect(result.current.fstate.count).toBe(0);
			expect(result.current.fstate.isEmpty).toBe(true);
		});

		it('should initialize with provided items', () => {
			const initialItems: TestItem[] = [
				{ id: '1', value: 'one' },
				{ id: '2', value: 'two' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			expect(result.current.fstate.items).toEqual(initialItems);
			expect(result.current.fstate.count).toBe(2);
			expect(result.current.fstate.isEmpty).toBe(false);
		});
	});

	describe('add action', () => {
		it('should add item to list', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			act(() => {
				result.current.actions.add({ id: '1', value: 'test' });
			});

			expect(result.current.fstate.items).toEqual([{ id: '1', value: 'test' }]);
			expect(result.current.fstate.count).toBe(1);
			expect(result.current.fstate.isEmpty).toBe(false);
		});

		it('should add multiple items', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			act(() => {
				result.current.actions.add({ id: '1', value: 'one' });
				result.current.actions.add({ id: '2', value: 'two' });
			});

			expect(result.current.fstate.items).toHaveLength(2);
			expect(result.current.fstate.count).toBe(2);
		});

		it('should respect maxItems constraint', () => {
			const { result } = renderHook(() => useListItems<TestItem>({ maxItems: 2 }));

			act(() => {
				result.current.actions.add({ id: '1', value: 'one' });
				result.current.actions.add({ id: '2', value: 'two' });
			});

			expect(result.current.fstate.canAdd).toBe(false);

			act(() => {
				result.current.actions.add({ id: '3', value: 'three' });
			});

			// Should not add third item
			expect(result.current.fstate.items).toHaveLength(2);
		});
	});

	describe('remove action', () => {
		it('should remove item by index', () => {
			const initialItems: TestItem[] = [
				{ id: '1', value: 'one' },
				{ id: '2', value: 'two' },
				{ id: '3', value: 'three' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.remove(1);
			});

			expect(result.current.fstate.items).toEqual([
				{ id: '1', value: 'one' },
				{ id: '3', value: 'three' },
			]);
			expect(result.current.fstate.count).toBe(2);
		});

		it('should ignore invalid index', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.remove(5);
			});

			expect(result.current.fstate.items).toHaveLength(1);
		});

		it('should ignore negative index', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.remove(-1);
			});

			expect(result.current.fstate.items).toHaveLength(1);
		});

		it('should respect minItems constraint', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems, minItems: 1 }));

			expect(result.current.fstate.canRemove).toBe(false);

			act(() => {
				result.current.actions.remove(0);
			});

			// Should not remove the item
			expect(result.current.fstate.items).toHaveLength(1);
		});
	});

	describe('update action', () => {
		it('should update item by index', () => {
			const initialItems: TestItem[] = [
				{ id: '1', value: 'one' },
				{ id: '2', value: 'two' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.update(1, { value: 'updated' });
			});

			expect(result.current.fstate.items[1]).toEqual({
				id: '2',
				value: 'updated',
			});
		});

		it('should ignore invalid index', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.update(5, { value: 'updated' });
			});

			expect(result.current.fstate.items[0].value).toBe('one');
		});
	});

	describe('set action', () => {
		it('should replace entire list', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];
			const newItems: TestItem[] = [
				{ id: '2', value: 'two' },
				{ id: '3', value: 'three' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.set(newItems);
			});

			expect(result.current.fstate.items).toEqual(newItems);
			expect(result.current.fstate.count).toBe(2);
		});
	});

	describe('clear action', () => {
		it('should clear all items when minItems is 0', () => {
			const initialItems: TestItem[] = [
				{ id: '1', value: 'one' },
				{ id: '2', value: 'two' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems, minItems: 0 }));

			act(() => {
				result.current.actions.clear();
			});

			expect(result.current.fstate.items).toEqual([]);
			expect(result.current.fstate.isEmpty).toBe(true);
		});

		it('should not clear when minItems > 0', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems, minItems: 1 }));

			act(() => {
				result.current.actions.clear();
			});

			expect(result.current.fstate.items).toHaveLength(1);
		});
	});

	describe('reorder action', () => {
		it('should reorder items', () => {
			const initialItems: TestItem[] = [
				{ id: '1', value: 'one' },
				{ id: '2', value: 'two' },
				{ id: '3', value: 'three' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.reorder(0, 2);
			});

			expect(result.current.fstate.items).toEqual([
				{ id: '2', value: 'two' },
				{ id: '3', value: 'three' },
				{ id: '1', value: 'one' },
			]);
		});

		it('should ignore reorder with same index', () => {
			const initialItems: TestItem[] = [
				{ id: '1', value: 'one' },
				{ id: '2', value: 'two' },
			];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.reorder(1, 1);
			});

			expect(result.current.fstate.items).toEqual(initialItems);
		});

		it('should ignore invalid indices', () => {
			const initialItems: TestItem[] = [{ id: '1', value: 'one' }];

			const { result } = renderHook(() => useListItems<TestItem>({ initialItems }));

			act(() => {
				result.current.actions.reorder(0, 5);
			});

			expect(result.current.fstate.items).toEqual(initialItems);
		});
	});

	describe('derived state', () => {
		it('should calculate canAdd based on maxItems', () => {
			const { result } = renderHook(() => useListItems<TestItem>({ maxItems: 2 }));

			expect(result.current.fstate.canAdd).toBe(true);

			act(() => {
				result.current.actions.add({ id: '1', value: 'one' });
				result.current.actions.add({ id: '2', value: 'two' });
			});

			expect(result.current.fstate.canAdd).toBe(false);
		});

		it('should calculate canRemove based on minItems', () => {
			const { result } = renderHook(() => useListItems<TestItem>({ minItems: 1 }));

			expect(result.current.fstate.canRemove).toBe(false);

			act(() => {
				result.current.actions.add({ id: '1', value: 'one' });
				result.current.actions.add({ id: '2', value: 'two' });
			});

			expect(result.current.fstate.canRemove).toBe(true);
		});

		it('should calculate isEmpty correctly', () => {
			const { result } = renderHook(() => useListItems<TestItem>());

			expect(result.current.fstate.isEmpty).toBe(true);

			act(() => {
				result.current.actions.add({ id: '1', value: 'one' });
			});

			expect(result.current.fstate.isEmpty).toBe(false);
		});
	});
});
