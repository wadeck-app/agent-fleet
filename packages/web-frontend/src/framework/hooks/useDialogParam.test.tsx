import { MemoryRouter } from 'react-router-dom';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDialogParam } from './useDialogParam';

describe('useDialogParam', () => {
	const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

	it('should initialize with isOpen false when no URL param', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		expect(result.current.isOpen).toBe(false);
	});

	it('should initialize with isOpen true when URL param matches dialogName', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=create-workspace']}>{children}</MemoryRouter>
			),
		});

		expect(result.current.isOpen).toBe(true);
	});

	it('should initialize with isOpen false when URL param does not match dialogName', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=edit-project']}>{children}</MemoryRouter>
			),
		});

		expect(result.current.isOpen).toBe(false);
	});

	it('should set isOpen to true when open() is called', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		expect(result.current.isOpen).toBe(false);

		act(() => {
			result.current.open();
		});

		expect(result.current.isOpen).toBe(true);
	});

	it('should set isOpen to false when close() is called', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=create-workspace']}>{children}</MemoryRouter>
			),
		});

		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.close();
		});

		expect(result.current.isOpen).toBe(false);
	});

	it('should open dialog when onOpenChange(true) is called', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		expect(result.current.isOpen).toBe(false);

		act(() => {
			result.current.onOpenChange(true);
		});

		expect(result.current.isOpen).toBe(true);
	});

	it('should close dialog when onOpenChange(false) is called', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=create-workspace']}>{children}</MemoryRouter>
			),
		});

		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.onOpenChange(false);
		});

		expect(result.current.isOpen).toBe(false);
	});

	it('should respond to matching dialogName in URL param', () => {
		const { result: matchingDialog } = renderHook(() => useDialogParam('create-workspace'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=create-workspace']}>{children}</MemoryRouter>
			),
		});

		const { result: nonMatchingDialog } = renderHook(() => useDialogParam('edit-project'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=create-workspace']}>{children}</MemoryRouter>
			),
		});

		expect(matchingDialog.current.isOpen).toBe(true);
		expect(nonMatchingDialog.current.isOpen).toBe(false);
	});

	it('should have stable return value reference when isOpen has not changed', () => {
		const { result, rerender } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		const firstReturn = result.current;
		rerender();
		const secondReturn = result.current;

		expect(firstReturn).toBe(secondReturn);
	});

	it('should update return value reference when isOpen changes', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		const beforeOpen = result.current;
		expect(beforeOpen.isOpen).toBe(false);

		act(() => {
			result.current.open();
		});

		const afterOpen = result.current;
		expect(afterOpen.isOpen).toBe(true);
		expect(beforeOpen).not.toBe(afterOpen);
	});

	it('should have stable callback references', () => {
		const { result, rerender } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		const firstOpen = result.current.open;
		const firstClose = result.current.close;
		const firstOnOpenChange = result.current.onOpenChange;

		rerender();

		expect(result.current.open).toBe(firstOpen);
		expect(result.current.close).toBe(firstClose);
		expect(result.current.onOpenChange).toBe(firstOnOpenChange);
	});

	it('should handle multiple open/close cycles', () => {
		const { result } = renderHook(() => useDialogParam('create-workspace'), { wrapper });

		expect(result.current.isOpen).toBe(false);

		act(() => {
			result.current.open();
		});
		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.close();
		});
		expect(result.current.isOpen).toBe(false);

		act(() => {
			result.current.open();
		});
		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.close();
		});
		expect(result.current.isOpen).toBe(false);
	});

	it('should transition between different dialog names', () => {
		// Start with dialog-a open
		const { result, rerender } = renderHook(
			({ dialogName }: { dialogName: string }) => useDialogParam(dialogName),
			{
				initialProps: { dialogName: 'dialog-a' },
				wrapper: ({ children }) => (
					<MemoryRouter initialEntries={['?dialog=dialog-a']}>{children}</MemoryRouter>
				),
			}
		);

		expect(result.current.isOpen).toBe(true);

		// Change to dialog-b (should be closed because URL still has dialog-a)
		rerender({ dialogName: 'dialog-b' });
		expect(result.current.isOpen).toBe(false);
	});

	it('should support URL persistence pattern (open, refresh, dialog reopens)', () => {
		// Initial render with dialog closed
		const { result } = renderHook(() => useDialogParam('create-workspace'), { wrapper });
		expect(result.current.isOpen).toBe(false);

		// Open dialog
		act(() => {
			result.current.open();
		});
		expect(result.current.isOpen).toBe(true);

		// Simulate page refresh with URL param persisted
		const { result: refreshedResult } = renderHook(() => useDialogParam('create-workspace'), {
			wrapper: ({ children }) => (
				<MemoryRouter initialEntries={['?dialog=create-workspace']}>{children}</MemoryRouter>
			),
		});

		// Dialog should be open after refresh
		expect(refreshedResult.current.isOpen).toBe(true);
	});
});
