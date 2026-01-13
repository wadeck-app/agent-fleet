import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDialogDeleteConfirmation } from './useDialogDeleteConfirmation';

describe('useDialogDeleteConfirmation', () => {
	const defaultOptions = {
		itemTypeName: 'ingredient',
		onDelete: vi.fn(),
	};

	describe('Core Functionality', () => {
		it('opens dialog with item', () => {
			const { result } = renderHook(() => useDialogDeleteConfirmation<string>(defaultOptions));

			act(() => {
				result.current.open('item-123');
			});

			expect(result.current.isOpen).toBe(true);
			expect(result.current.item).toBe('item-123');
		});

		it('calls onDelete with correct item when confirm is called', async () => {
			const onDelete = vi.fn();
			const { result } = renderHook(() =>
				useDialogDeleteConfirmation<string>({
					itemTypeName: 'ingredient',
					onDelete,
				})
			);

			act(() => {
				result.current.open('item-123');
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(onDelete).toHaveBeenCalledOnce();
			expect(onDelete).toHaveBeenCalledWith('item-123');
		});

		it('auto-closes after deletion', async () => {
			const onDelete = vi.fn().mockResolvedValue(undefined);
			const { result } = renderHook(() =>
				useDialogDeleteConfirmation({
					itemTypeName: 'ingredient',
					onDelete,
				})
			);

			act(() => {
				result.current.open('item-123');
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(result.current.isOpen).toBe(false);
		});

		it('handles async onDelete', async () => {
			const asyncOnDelete = vi.fn().mockImplementation(
				() =>
					new Promise(resolve => {
						setTimeout(resolve, 10);
					})
			);

			const { result } = renderHook(() =>
				useDialogDeleteConfirmation({
					itemTypeName: 'ingredient',
					onDelete: asyncOnDelete,
				})
			);

			act(() => {
				result.current.open('item-123');
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(asyncOnDelete).toHaveBeenCalledWith('item-123');
		});
	});

	describe('Title Generation', () => {
		it('generates generic title without getItemDisplayName', () => {
			const { result } = renderHook(() => useDialogDeleteConfirmation(defaultOptions));

			act(() => {
				result.current.open('item-123');
			});

			expect(result.current.dialogProps.title).toBe('Delete ingredient?');
		});

		it('generates personalized title with getItemDisplayName', () => {
			interface Item {
				id: string;
				name: string;
			}

			const { result } = renderHook(() =>
				useDialogDeleteConfirmation<Item>({
					itemTypeName: 'book',
					onDelete: vi.fn(),
					getItemDisplayName: item => item.name,
				})
			);

			act(() => {
				result.current.open({ id: '123', name: 'The Great Gatsby' });
			});

			expect(result.current.dialogProps.title).toBe('Delete "The Great Gatsby"?');
		});

		it('updates title when different item is opened', () => {
			interface Item {
				id: string;
				name: string;
			}

			const { result } = renderHook(() =>
				useDialogDeleteConfirmation<Item>({
					itemTypeName: 'book',
					onDelete: vi.fn(),
					getItemDisplayName: item => item.name,
				})
			);

			act(() => {
				result.current.open({ id: '1', name: 'Book 1' });
			});

			expect(result.current.dialogProps.title).toBe('Delete "Book 1"?');

			act(() => {
				result.current.open({ id: '2', name: 'Book 2' });
			});

			expect(result.current.dialogProps.title).toBe('Delete "Book 2"?');
		});
	});

	describe('Description Generation', () => {
		it('generates default description', () => {
			const { result } = renderHook(() => useDialogDeleteConfirmation(defaultOptions));

			expect(result.current.dialogProps.description).toBe(
				'This action cannot be undone. The ingredient will be permanently deleted.'
			);
		});

		it('uses custom description when provided', () => {
			const { result } = renderHook(() =>
				useDialogDeleteConfirmation({
					itemTypeName: 'workspace',
					onDelete: vi.fn(),
					description: 'All data in this workspace will be permanently deleted.',
				})
			);

			expect(result.current.dialogProps.description).toBe(
				'All data in this workspace will be permanently deleted.'
			);
		});
	});

	describe('Configuration', () => {
		it('uses "danger" variant by default', () => {
			const { result } = renderHook(() => useDialogDeleteConfirmation(defaultOptions));

			expect(result.current.dialogProps.variant).toBe('danger');
		});
	});
});
