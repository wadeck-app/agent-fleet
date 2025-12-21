import { useEffect } from 'react';

import { useToast } from '@framework/features/toast/ToastContext';

/**
 * ===========================================================================================
 * USE ERROR TOAST - Error Toast Display Hook
 * ===========================================================================================
 *
 * Automatically displays error messages as toasts and clears them.
 * - Monitors error state changes
 * - Shows toast when error occurs
 * - Automatically calls clearError after displaying
 * - Prevents duplicate toasts
 *
 * Problem Solved:
 * Components often need to show errors as toasts and then clear the error state.
 * This hook eliminates the repetitive useEffect pattern for error handling.
 *
 * Example usage:
 * ```typescript
 * // Before: Repetitive pattern
 * useEffect(() => {
 *   if (error) {
 *     showToast(error, 'error');
 *     clearError();
 *   }
 * }, [error, showToast, clearError]);
 *
 * // After: Clean one-liner
 * useErrorToast({ error, clearError });
 * ```
 *
 * ===========================================================================================
 */

export interface UseErrorToastOptions {
	/**
	 * The error message to display, or null if no error
	 */
	error: string | null;

	/**
	 * Function to call after displaying the error toast to clear the error state
	 */
	clearError: () => void;
}

/**
 * Hook that automatically displays error messages as toasts
 *
 * @param options - Configuration object with error and clearError
 *
 * @example
 * ```typescript
 * const { error, clearError } = useIngredients();
 * useErrorToast({ error, clearError });
 * ```
 */
export function useErrorToast({ error, clearError }: UseErrorToastOptions): void {
	const { showToast } = useToast();

	useEffect(() => {
		if (error) {
			showToast(error, 'error');
			clearError();
		}
	}, [error, showToast, clearError]);
}
