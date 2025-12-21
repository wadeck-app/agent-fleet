import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UseRoutedDialogOptions, useRoutedDialog } from './useRoutedDialog';

interface TestItem {
	id: string;
	name: string;
}

describe('useRoutedDialog', () => {
	const testItems: TestItem[] = [
		{ id: '1', name: 'Item 1' },
		{ id: '2', name: 'Item 2' },
		{ id: '3', name: 'Item 3' },
	];

	const defaultFindItem = (items: TestItem[], id: string) => items.find(i => i.id === id);

	const createDefaultOptions = (
		overrides?: Partial<UseRoutedDialogOptions<TestItem>>
	): UseRoutedDialogOptions<TestItem> => ({
		mode: undefined,
		id: undefined,
		items: testItems,
		findItem: defaultFindItem,
		onNavigateBack: vi.fn(),
		...overrides,
	});

	describe('isOpen calculation', () => {
		it('should set isOpen to false when mode is undefined', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: undefined })));

			expect(result.current.isOpen).toBe(false);
		});

		it('should set isOpen to true when mode is "new"', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: 'new' })));

			expect(result.current.isOpen).toBe(true);
		});

		it('should set isOpen to true when mode is "edit" with id', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: 'edit', id: '1' })));

			expect(result.current.isOpen).toBe(true);
		});

		it('should set isOpen to false when mode is "edit" without id', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: 'edit', id: undefined })));

			expect(result.current.isOpen).toBe(false);
		});
	});

	describe('editingItem state', () => {
		it('should initialize editingItem as null', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: undefined })));

			expect(result.current.editingItem).toBeNull();
		});

		it('should set editingItem when mode is "edit" with valid id', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: 'edit', id: '2' })));

			expect(result.current.editingItem).toEqual({ id: '2', name: 'Item 2' });
		});

		it('should not set editingItem when mode is "edit" with invalid id', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: 'edit', id: '999' })));

			expect(result.current.editingItem).toBeNull();
		});

		it('should set editingItem to null when mode is "new"', () => {
			const { result } = renderHook(() => useRoutedDialog(createDefaultOptions({ mode: 'new' })));

			expect(result.current.editingItem).toBeNull();
		});

		it('should clear editingItem when mode changes from "edit" to "new"', () => {
			const { result, rerender } = renderHook(
				({ mode, id }: { mode: 'new' | 'edit' | undefined; id: string | undefined }) =>
					useRoutedDialog(createDefaultOptions({ mode, id })),
				{
					initialProps: {
						mode: 'edit' as 'new' | 'edit' | undefined,
						id: '1' as string | undefined,
					},
				}
			);

			expect(result.current.editingItem).toEqual({ id: '1', name: 'Item 1' });

			rerender({ mode: 'new', id: undefined });

			expect(result.current.editingItem).toBeNull();
		});

		it('should clear editingItem when mode changes to undefined', () => {
			const { result, rerender } = renderHook(
				({ mode, id }: { mode: 'new' | 'edit' | undefined; id: string | undefined }) =>
					useRoutedDialog(createDefaultOptions({ mode, id })),
				{
					initialProps: {
						mode: 'edit' as 'new' | 'edit' | undefined,
						id: '1' as string | undefined,
					},
				}
			);

			expect(result.current.editingItem).toEqual({ id: '1', name: 'Item 1' });

			rerender({ mode: undefined, id: undefined });

			expect(result.current.editingItem).toBeNull();
		});
	});

	describe('findItem functionality', () => {
		it('should use custom findItem function', () => {
			const customFindItem = vi.fn((items: TestItem[], id: string) => items.find(i => i.id === id));

			renderHook(() =>
				useRoutedDialog(
					createDefaultOptions({
						mode: 'edit',
						id: '2',
						findItem: customFindItem,
					})
				)
			);

			expect(customFindItem).toHaveBeenCalledWith(testItems, '2');
		});

		it('should handle findItem returning undefined', () => {
			const customFindItem = () => undefined;

			const { result } = renderHook(() =>
				useRoutedDialog(
					createDefaultOptions({
						mode: 'edit',
						id: '999',
						findItem: customFindItem,
					})
				)
			);

			expect(result.current.editingItem).toBeNull();
		});

		it('should support different item types', () => {
			interface CustomItem {
				uuid: string;
				title: string;
			}

			const customItems: CustomItem[] = [
				{ uuid: 'abc', title: 'Custom Item 1' },
				{ uuid: 'def', title: 'Custom Item 2' },
			];

			const customFindItem = (items: CustomItem[], id: string) => items.find(i => i.uuid === id);

			const { result } = renderHook(() =>
				useRoutedDialog({
					mode: 'edit' as const,
					id: 'abc',
					items: customItems,
					findItem: customFindItem,
					onNavigateBack: vi.fn(),
				})
			);

			expect(result.current.editingItem).toEqual({ uuid: 'abc', title: 'Custom Item 1' });
		});
	});

	describe('mode transitions', () => {
		it('should handle transition from undefined to "new"', () => {
			const { result, rerender } = renderHook(
				({ mode }: { mode: 'new' | 'edit' | undefined }) => useRoutedDialog(createDefaultOptions({ mode })),
				{
					initialProps: { mode: undefined as 'new' | 'edit' | undefined },
				}
			);

			expect(result.current.isOpen).toBe(false);

			rerender({ mode: 'new' });

			expect(result.current.isOpen).toBe(true);
			expect(result.current.editingItem).toBeNull();
		});

		it('should handle transition from undefined to "edit"', () => {
			const { result, rerender } = renderHook(
				({ mode, id }: { mode: 'new' | 'edit' | undefined; id: string | undefined }) =>
					useRoutedDialog(createDefaultOptions({ mode, id })),
				{
					initialProps: {
						mode: undefined as 'new' | 'edit' | undefined,
						id: undefined as string | undefined,
					},
				}
			);

			expect(result.current.isOpen).toBe(false);

			rerender({ mode: 'edit', id: '1' });

			expect(result.current.isOpen).toBe(true);
			expect(result.current.editingItem).toEqual({ id: '1', name: 'Item 1' });
		});

		it('should handle transition from "new" to "edit"', () => {
			const { result, rerender } = renderHook(
				({ mode, id }: { mode: 'new' | 'edit' | undefined; id: string | undefined }) =>
					useRoutedDialog(createDefaultOptions({ mode, id })),
				{
					initialProps: {
						mode: 'new' as 'new' | 'edit' | undefined,
						id: undefined as string | undefined,
					},
				}
			);

			expect(result.current.editingItem).toBeNull();

			rerender({ mode: 'edit', id: '2' });

			expect(result.current.editingItem).toEqual({ id: '2', name: 'Item 2' });
		});

		it('should handle editing different items sequentially', () => {
			const { result, rerender } = renderHook(
				({ id }) => useRoutedDialog(createDefaultOptions({ mode: 'edit', id })),
				{
					initialProps: { id: '1' },
				}
			);

			expect(result.current.editingItem).toEqual({ id: '1', name: 'Item 1' });

			rerender({ id: '3' });

			expect(result.current.editingItem).toEqual({ id: '3', name: 'Item 3' });
		});
	});

	describe('items array updates', () => {
		it('should update editingItem when items array changes for same ID (enables refresh functionality)', () => {
			const initialItems = [{ id: '1', name: 'Old Item 1' }];
			const updatedItems = [{ id: '1', name: 'Updated Item 1' }];

			const { result, rerender } = renderHook(
				({ items }) =>
					useRoutedDialog({
						mode: 'edit',
						id: '1',
						items,
						findItem: defaultFindItem,
						onNavigateBack: vi.fn(),
					}),
				{
					initialProps: { items: initialItems },
				}
			);

			expect(result.current.editingItem).toEqual({ id: '1', name: 'Old Item 1' });

			rerender({ items: updatedItems });

			expect(result.current.editingItem).toEqual({ id: '1', name: 'Updated Item 1' });
		});

		it('should handle items array being empty', () => {
			const { result } = renderHook(() =>
				useRoutedDialog(
					createDefaultOptions({
						mode: 'edit',
						id: '1',
						items: [],
					})
				)
			);

			expect(result.current.editingItem).toBeNull();
		});

		it('should find item once items array is populated', () => {
			const { result, rerender } = renderHook(
				({ items }) =>
					useRoutedDialog({
						mode: 'edit',
						id: '1',
						items,
						findItem: defaultFindItem,
						onNavigateBack: vi.fn(),
					}),
				{
					initialProps: { items: [] as TestItem[] },
				}
			);

			expect(result.current.editingItem).toBeNull();

			rerender({ items: testItems });

			expect(result.current.editingItem).toEqual({ id: '1', name: 'Item 1' });
		});
	});

	// Note: Manual setEditingItem tests removed
	// After implementing form reset prevention (line 138), manual override is not supported
	// as the useEffect will override any manual changes based on URL state
	// This is intentional to prevent form resets during partial updates

	describe('integration scenarios', () => {
		it('should simulate typical ingredient edit flow', () => {
			const navigate = vi.fn();

			const { result, rerender } = renderHook(
				({ mode, id }: { mode: 'new' | 'edit' | undefined; id: string | undefined }) =>
					useRoutedDialog({
						mode,
						id,
						items: testItems,
						findItem: defaultFindItem,
						onNavigateBack: navigate,
					}),
				{
					initialProps: {
						mode: undefined as 'new' | 'edit' | undefined,
						id: undefined as string | undefined,
					},
				}
			);

			// Initially closed
			expect(result.current.isOpen).toBe(false);

			// Navigate to edit mode
			rerender({ mode: 'edit', id: '1' });
			expect(result.current.isOpen).toBe(true);
			expect(result.current.editingItem).toEqual({ id: '1', name: 'Item 1' });

			// Navigate back
			rerender({ mode: undefined, id: undefined });
			expect(result.current.isOpen).toBe(false);
			expect(result.current.editingItem).toBeNull();
		});

		it('should simulate typical book create flow', () => {
			const { result, rerender } = renderHook(
				({ mode }: { mode: 'new' | 'edit' | undefined }) => useRoutedDialog(createDefaultOptions({ mode })),
				{
					initialProps: { mode: undefined as 'new' | 'edit' | undefined },
				}
			);

			// Initially closed
			expect(result.current.isOpen).toBe(false);

			// Navigate to create mode
			rerender({ mode: 'new' });
			expect(result.current.isOpen).toBe(true);
			expect(result.current.editingItem).toBeNull();

			// Navigate back
			rerender({ mode: undefined });
			expect(result.current.isOpen).toBe(false);
		});
	});
});
