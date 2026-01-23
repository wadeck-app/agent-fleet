import React from 'react';

import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { act, renderHook } from '@testing-library/react';
import { AlertTriangle } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { useDialogActionConfirmation } from './useDialogActionConfirmation';

describe('useDialogActionConfirmation', () => {
	const defaultOptions = {
		title: 'Confirm Action',
		description: 'Are you sure you want to perform this action?',
		onConfirm: vi.fn(),
	};

	describe('Core Functionality', () => {
		it('opens dialog with context', () => {
			const { result } = renderHook(() => useDialogActionConfirmation<string>(defaultOptions));

			act(() => {
				result.current.open('context-data');
			});

			expect(result.current.isOpen).toBe(true);
			expect(result.current.context).toBe('context-data');
		});

		it('calls onConfirm with correct context', async () => {
			const onConfirm = vi.fn();
			const { result } = renderHook(() =>
				useDialogActionConfirmation<string>({
					...defaultOptions,
					onConfirm,
				})
			);

			act(() => {
				result.current.open('context-data');
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(onConfirm).toHaveBeenCalledOnce();
			expect(onConfirm).toHaveBeenCalledWith('context-data');
		});

		it('auto-closes after confirmation', async () => {
			const onConfirm = vi.fn().mockResolvedValue(undefined);
			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					...defaultOptions,
					onConfirm,
				})
			);

			act(() => {
				result.current.open();
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(result.current.isOpen).toBe(false);
		});

		it('handles async onConfirm', async () => {
			const confirmDeferred = createDeferredPromise<void>();
			const asyncOnConfirm = vi.fn(() => confirmDeferred.promise);

			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					...defaultOptions,
					onConfirm: asyncOnConfirm,
				})
			);

			act(() => {
				result.current.open('context-data');
			});

			// Trigger confirm and resolve immediately
			confirmDeferred.resolve();
			await act(async () => {
				await result.current.confirm();
			});

			expect(asyncOnConfirm).toHaveBeenCalledWith('context-data');
		});
	});

	describe('Configuration', () => {
		it('uses provided title and description', () => {
			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					title: 'Custom Title',
					description: 'Custom Description',
					onConfirm: vi.fn(),
				})
			);

			expect(result.current.dialogProps.title).toBe('Custom Title');
			expect(result.current.dialogProps.description).toBe('Custom Description');
		});

		it('uses provided confirmLabel and cancelLabel', () => {
			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					...defaultOptions,
					confirmLabel: 'Proceed',
					cancelLabel: 'Abort',
				})
			);

			expect(result.current.dialogProps.confirmLabel).toBe('Proceed');
			expect(result.current.dialogProps.cancelLabel).toBe('Abort');
		});

		it('uses provided variant', () => {
			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					...defaultOptions,
					variant: 'warning',
				})
			);

			expect(result.current.dialogProps.variant).toBe('warning');
		});

		it('uses provided icon', () => {
			const customIcon = <AlertTriangle />;
			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					...defaultOptions,
					icon: customIcon,
				})
			);

			expect(result.current.dialogProps.icon).toBe(customIcon);
		});

		it('uses provided size', () => {
			const { result } = renderHook(() =>
				useDialogActionConfirmation({
					...defaultOptions,
					size: 'sm',
				})
			);

			expect(result.current.dialogProps.size).toBe('sm');
		});
	});

	describe('Real-world Use Case', () => {
		it('handles archive confirmation with context', async () => {
			interface Task {
				id: string;
				name: string;
			}

			const onArchive = vi.fn();
			const { result } = renderHook(() =>
				useDialogActionConfirmation<Task>({
					title: 'Archive Task?',
					description: 'Archived tasks can be restored later.',
					confirmLabel: 'Archive',
					variant: 'warning',
					onConfirm: onArchive,
				})
			);

			const task: Task = { id: '123', name: 'Test Task' };

			act(() => {
				result.current.open(task);
			});

			await act(async () => {
				await result.current.confirm();
			});

			expect(onArchive).toHaveBeenCalledWith(task);
		});
	});
});
