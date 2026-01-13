import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDialog } from './useDialog';

describe('useDialog', () => {
	describe('State Management', () => {
		it('initializes with closed state and null item', () => {
			const { result } = renderHook(() => useDialog());

			expect(result.current.isOpen).toBe(false);
			expect(result.current.item).toBe(null);
		});

		it('opens dialog with context item', () => {
			const { result } = renderHook(() => useDialog<string>());

			act(() => {
				result.current.open('test-id');
			});

			expect(result.current.isOpen).toBe(true);
			expect(result.current.item).toBe('test-id');
		});

		it('closes dialog and clears item', () => {
			const { result } = renderHook(() => useDialog<string>());

			act(() => {
				result.current.open('test-id');
			});

			act(() => {
				result.current.close();
			});

			expect(result.current.isOpen).toBe(false);
			expect(result.current.item).toBe(null);
		});
	});

	describe('Confirm Behavior', () => {
		it('calls onConfirm with correct item', async () => {
			const onConfirm = vi.fn();
			const { result } = renderHook(() => useDialog<string>({ onConfirm }));

			act(() => {
				result.current.open('test-id');
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(onConfirm).toHaveBeenCalledOnce();
			expect(onConfirm).toHaveBeenCalledWith('test-id');
		});

		it('handles async onConfirm callback', async () => {
			const asyncOnConfirm = vi.fn().mockResolvedValue(undefined);
			const { result } = renderHook(() => useDialog({ onConfirm: asyncOnConfirm }));

			act(() => {
				result.current.open();
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(asyncOnConfirm).toHaveBeenCalledOnce();
		});

		it('auto-closes after confirm by default', async () => {
			const onConfirm = vi.fn();
			const { result } = renderHook(() => useDialog({ onConfirm }));

			act(() => {
				result.current.open();
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(result.current.isOpen).toBe(false);
		});

		it('does not auto-close when autoClose is false', async () => {
			const onConfirm = vi.fn();
			const { result } = renderHook(() => useDialog({ onConfirm, autoClose: false }));

			act(() => {
				result.current.open('test-id');
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(result.current.isOpen).toBe(true);
			expect(result.current.item).toBe('test-id');
		});
	});

	describe('Cancel Behavior', () => {
		it('calls onCancel and closes dialog', () => {
			const onCancel = vi.fn();
			const { result } = renderHook(() => useDialog({ onCancel }));

			act(() => {
				result.current.open('test-id');
			});

			act(() => {
				result.current.cancel();
			});

			expect(onCancel).toHaveBeenCalledOnce();
			expect(result.current.isOpen).toBe(false);
		});
	});
});
