import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useErrorToast } from './useErrorToast';

// Mock the useToast hook - use vi.hoisted to avoid hoisting issues
const { mockShowToast, mockUseToast } = vi.hoisted(() => {
	const mockShowToast = vi.fn();
	const mockUseToast = vi.fn(() => ({ showToast: mockShowToast }));
	return { mockShowToast, mockUseToast };
});

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: mockUseToast,
}));

// Type helper for test props
type TestProps = {
	error: string | null;
	clearError: ReturnType<typeof vi.fn>;
};

describe('useErrorToast', () => {
	let clearErrorMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockShowToast.mockClear();
		clearErrorMock = vi.fn();
		mockUseToast.mockReturnValue({ showToast: mockShowToast });
	});

	// Helper to render hook with proper typing
	const renderErrorToast = (error: string | null, clearError = clearErrorMock) =>
		renderHook(() => useErrorToast({ error, clearError: clearError as () => void }));

	// Helper to render hook with rerender capability
	const renderErrorToastWithRerender = (initialError: string | null, initialClearError = clearErrorMock) =>
		renderHook(
			({ error, clearError }: TestProps) => useErrorToast({ error, clearError: clearError as () => void }),
			{
				initialProps: { error: initialError, clearError: initialClearError },
			}
		);

	describe('error handling', () => {
		it('should show toast when error is present', () => {
			renderErrorToast('Something went wrong');

			expect(mockShowToast).toHaveBeenCalledWith('Something went wrong', 'error');
		});

		it('should call clearError after showing toast', () => {
			renderErrorToast('Something went wrong');

			expect(clearErrorMock).toHaveBeenCalledOnce();
		});

		it('should not show toast when error is null', () => {
			renderErrorToast(null);

			expect(mockShowToast).not.toHaveBeenCalled();
			expect(clearErrorMock).not.toHaveBeenCalled();
		});

		it('should not show toast when error is empty string', () => {
			renderErrorToast('');

			expect(mockShowToast).not.toHaveBeenCalled();
			expect(clearErrorMock).not.toHaveBeenCalled();
		});
	});

	describe('error message variations', () => {
		it('should handle short error messages', () => {
			renderErrorToast('Error');

			expect(mockShowToast).toHaveBeenCalledWith('Error', 'error');
		});

		it('should handle long error messages', () => {
			const longError = 'An unexpected error occurred while processing your request. Please try again later.';
			renderErrorToast(longError);

			expect(mockShowToast).toHaveBeenCalledWith(longError, 'error');
		});

		it('should handle error messages with special characters', () => {
			renderErrorToast('Error: Failed to load data (code: 500)');

			expect(mockShowToast).toHaveBeenCalledWith('Error: Failed to load data (code: 500)', 'error');
		});

		it('should handle multiline error messages', () => {
			const multilineError = 'Error occurred:\nLine 1\nLine 2';
			renderErrorToast(multilineError);

			expect(mockShowToast).toHaveBeenCalledWith(multilineError, 'error');
		});
	});

	describe('rerender behavior', () => {
		it('should show toast when error changes from null to error', () => {
			const { rerender } = renderErrorToastWithRerender(null);

			expect(mockShowToast).not.toHaveBeenCalled();

			rerender({ error: 'New error', clearError: clearErrorMock });

			expect(mockShowToast).toHaveBeenCalledWith('New error', 'error');
			expect(clearErrorMock).toHaveBeenCalledOnce();
		});

		it('should show toast for each new error', () => {
			const { rerender } = renderErrorToastWithRerender('First error');

			expect(mockShowToast).toHaveBeenCalledWith('First error', 'error');
			expect(clearErrorMock).toHaveBeenCalledTimes(1);

			mockShowToast.mockClear();
			clearErrorMock.mockClear();

			rerender({ error: 'Second error', clearError: clearErrorMock });

			expect(mockShowToast).toHaveBeenCalledWith('Second error', 'error');
			expect(clearErrorMock).toHaveBeenCalledTimes(1);
		});

		it('should not call showToast multiple times for same error', () => {
			const { rerender } = renderErrorToastWithRerender('Same error');

			expect(mockShowToast).toHaveBeenCalledTimes(1);
			mockShowToast.mockClear();

			// Note: In practice, clearError should set error to null after first call
			// But if clearError doesn't work or error doesn't update, we test the current behavior
			// useEffect won't re-trigger if dependencies haven't changed (error is still 'Same error')
			rerender({ error: 'Same error', clearError: clearErrorMock });

			// Should NOT call again because error hasn't changed (useEffect dependencies)
			expect(mockShowToast).toHaveBeenCalledTimes(0);
		});

		it('should handle clearError function changing', () => {
			const newClearError = vi.fn();
			const { rerender } = renderErrorToastWithRerender('Error');

			expect(clearErrorMock).toHaveBeenCalledOnce();
			clearErrorMock.mockClear();

			rerender({ error: 'New error', clearError: newClearError });

			expect(newClearError).toHaveBeenCalledOnce();
			expect(clearErrorMock).not.toHaveBeenCalled();
		});
	});

	describe('edge cases', () => {
		it('should handle error changing to null', () => {
			const { rerender } = renderErrorToastWithRerender('Error');

			expect(mockShowToast).toHaveBeenCalledOnce();
			mockShowToast.mockClear();
			clearErrorMock.mockClear();

			rerender({ error: null, clearError: clearErrorMock });

			expect(mockShowToast).not.toHaveBeenCalled();
			expect(clearErrorMock).not.toHaveBeenCalled();
		});

		it('should work with different clearError implementations', () => {
			const customClearError = vi.fn(() => {
				// Custom logic
			});

			renderErrorToast('Error', customClearError);

			expect(customClearError).toHaveBeenCalledOnce();
		});
	});

	describe('integration scenarios', () => {
		it('should simulate typical ingredient loading error', () => {
			renderErrorToast('Failed to load ingredients');

			expect(mockShowToast).toHaveBeenCalledWith('Failed to load ingredients', 'error');
			expect(clearErrorMock).toHaveBeenCalled();
		});

		it('should simulate typical book loading error', () => {
			renderErrorToast('Failed to load books');

			expect(mockShowToast).toHaveBeenCalledWith('Failed to load books', 'error');
			expect(clearErrorMock).toHaveBeenCalled();
		});

		it('should simulate network error', () => {
			renderErrorToast('Network request failed');

			expect(mockShowToast).toHaveBeenCalledWith('Network request failed', 'error');
			expect(clearErrorMock).toHaveBeenCalled();
		});
	});
});
