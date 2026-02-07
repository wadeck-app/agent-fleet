import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSyncedListItems } from './useSyncedListItems';

describe('useSyncedListItems', () => {
	interface TestItem {
		key: string;
		value: string;
	}

	describe('initialization', () => {
		it('should sync transformed data on mount', () => {
			const onSync = vi.fn();
			const initialItems: TestItem[] = [
				{ key: 'foo', value: 'bar' },
				{ key: 'baz', value: 'qux' },
			];

			renderHook(() =>
				useSyncedListItems({
					initialItems,
					transform: items => Object.fromEntries(items.map(item => [item.key, item.value])),
					onSync,
				})
			);

			expect(onSync).toHaveBeenCalledWith({
				foo: 'bar',
				baz: 'qux',
			});
		});

		it('should handle empty initial items', () => {
			const onSync = vi.fn();

			renderHook(() =>
				useSyncedListItems({
					initialItems: [],
					transform: items => items,
					onSync,
				})
			);

			expect(onSync).toHaveBeenCalledWith([]);
		});

		it('should handle no initial items provided', () => {
			const onSync = vi.fn();

			renderHook(() =>
				useSyncedListItems<TestItem>({
					transform: items => items,
					onSync,
				})
			);

			expect(onSync).toHaveBeenCalledWith([]);
		});
	});

	describe('syncing on changes', () => {
		it('should sync when items are added', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem, Record<string, string>>({
					initialItems: [{ key: 'foo', value: 'bar' }],
					transform: items => Object.fromEntries(items.map(item => [item.key, item.value])),
					onSync,
				})
			);

			// Clear the initial call
			onSync.mockClear();

			// Add a new item
			act(() => {
				result.current.actions.add({ key: 'baz', value: 'qux' });
			});

			expect(onSync).toHaveBeenCalledWith({
				foo: 'bar',
				baz: 'qux',
			});
		});

		it('should sync when items are removed', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem, Record<string, string>>({
					initialItems: [
						{ key: 'foo', value: 'bar' },
						{ key: 'baz', value: 'qux' },
					],
					transform: items => Object.fromEntries(items.map(item => [item.key, item.value])),
					onSync,
				})
			);

			onSync.mockClear();

			// Remove the first item
			act(() => {
				result.current.actions.remove(0);
			});

			expect(onSync).toHaveBeenCalledWith({
				baz: 'qux',
			});
		});

		it('should sync when items are updated', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem, Record<string, string>>({
					initialItems: [{ key: 'foo', value: 'bar' }],
					transform: items => Object.fromEntries(items.map(item => [item.key, item.value])),
					onSync,
				})
			);

			onSync.mockClear();

			// Update the value
			act(() => {
				result.current.actions.update(0, { value: 'updated' });
			});

			expect(onSync).toHaveBeenCalledWith({
				foo: 'updated',
			});
		});

		it('should sync when items are reordered', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem, string[]>({
					initialItems: [
						{ key: 'first', value: '1' },
						{ key: 'second', value: '2' },
					],
					transform: items => items.map(item => item.key),
					onSync,
				})
			);

			onSync.mockClear();

			// Reorder items
			act(() => {
				result.current.actions.reorder(0, 1);
			});

			expect(onSync).toHaveBeenCalledWith(['second', 'first']);
		});
	});

	describe('filtering', () => {
		it('should apply filter before transform', () => {
			const onSync = vi.fn();
			const initialItems: TestItem[] = [
				{ key: 'foo', value: 'bar' },
				{ key: '', value: 'empty_key' },
				{ key: 'baz', value: 'qux' },
			];

			renderHook(() =>
				useSyncedListItems({
					initialItems,
					transform: items => Object.fromEntries(items.map(item => [item.key, item.value])),
					onSync,
					filter: item => item.key.trim() !== '',
				})
			);

			// Should only include items with non-empty keys
			expect(onSync).toHaveBeenCalledWith({
				foo: 'bar',
				baz: 'qux',
			});
		});

		it('should reapply filter when items change', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem, Record<string, string>>({
					initialItems: [{ key: 'foo', value: 'bar' }],
					transform: items => Object.fromEntries(items.map(item => [item.key, item.value])),
					onSync,
					filter: item => item.key.trim() !== '',
				})
			);

			onSync.mockClear();

			// Add an item with empty key
			act(() => {
				result.current.actions.add({ key: '', value: 'should_be_filtered' });
			});

			// Should not include the empty key item
			expect(onSync).toHaveBeenCalledWith({
				foo: 'bar',
			});
		});
	});

	describe('constraints', () => {
		it('should respect minItems constraint', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem>({
					initialItems: [{ key: 'required', value: 'item' }],
					transform: items => items,
					onSync,
					minItems: 1,
				})
			);

			// canRemove should be false when at minItems
			expect(result.current.fstate.canRemove).toBe(false);

			// Trying to remove should not work
			act(() => {
				result.current.actions.remove(0);
			});

			expect(result.current.fstate.count).toBe(1);
		});

		it('should respect maxItems constraint', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem>({
					initialItems: [{ key: 'item1', value: 'value1' }],
					transform: items => items,
					onSync,
					maxItems: 1,
				})
			);

			// canAdd should be false when at maxItems
			expect(result.current.fstate.canAdd).toBe(false);

			// Trying to add should not work
			act(() => {
				result.current.actions.add({ key: 'item2', value: 'value2' });
			});

			expect(result.current.fstate.count).toBe(1);
		});

		it('should allow operations within constraints', () => {
			const onSync = vi.fn();
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem>({
					initialItems: [{ key: 'item1', value: 'value1' }],
					transform: items => items,
					onSync,
					minItems: 1,
					maxItems: 3,
				})
			);

			expect(result.current.fstate.canAdd).toBe(true);
			expect(result.current.fstate.canRemove).toBe(false);

			// Add an item
			act(() => {
				result.current.actions.add({ key: 'item2', value: 'value2' });
			});

			expect(result.current.fstate.count).toBe(2);
			expect(result.current.fstate.canRemove).toBe(true);
		});
	});

	describe('state access', () => {
		it('should expose fstate with derived state', () => {
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem>({
					initialItems: [
						{ key: 'foo', value: 'bar' },
						{ key: 'baz', value: 'qux' },
					],
					transform: items => items,
					onSync: vi.fn(),
				})
			);

			expect(result.current.fstate.count).toBe(2);
			expect(result.current.fstate.isEmpty).toBe(false);
			expect(result.current.fstate.canAdd).toBe(true);
			expect(result.current.fstate.canRemove).toBe(true);
		});

		it('should expose actions for manipulation', () => {
			const { result } = renderHook(() =>
				useSyncedListItems<TestItem>({
					initialItems: [],
					transform: items => items,
					onSync: vi.fn(),
				})
			);

			expect(result.current.actions).toHaveProperty('add');
			expect(result.current.actions).toHaveProperty('remove');
			expect(result.current.actions).toHaveProperty('update');
			expect(result.current.actions).toHaveProperty('set');
			expect(result.current.actions).toHaveProperty('clear');
			expect(result.current.actions).toHaveProperty('reorder');
		});
	});

	describe('complex transformations', () => {
		it('should handle transformation to different format', () => {
			const onSync = vi.fn();
			const initialItems: TestItem[] = [
				{ key: 'name', value: 'John' },
				{ key: 'age', value: '30' },
			];

			renderHook(() =>
				useSyncedListItems({
					initialItems,
					transform: items => ({
						formatted: items.map(item => `${item.key}=${item.value}`).join(','),
						count: items.length,
					}),
					onSync,
				})
			);

			expect(onSync).toHaveBeenCalledWith({
				formatted: 'name=John,age=30',
				count: 2,
			});
		});

		it('should handle array to array transformation', () => {
			const onSync = vi.fn();
			const initialItems: TestItem[] = [
				{ key: 'a', value: '1' },
				{ key: 'b', value: '2' },
			];

			renderHook(() =>
				useSyncedListItems({
					initialItems,
					transform: items => items.map(item => item.key.toUpperCase()),
					onSync,
				})
			);

			expect(onSync).toHaveBeenCalledWith(['A', 'B']);
		});
	});
});
