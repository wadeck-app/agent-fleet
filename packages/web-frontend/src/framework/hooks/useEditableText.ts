import { useCallback, useEffect, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Validator } from '@framework/utils/validation/textValidation';
import { isUnchanged } from '@framework/utils/validation/textValidation';

/**
 * ===========================================================================================
 * USE EDITABLE TEXT - Inline Editing State Management Hook
 * ===========================================================================================
 *
 * Manages state for inline text editing components.
 * Extracts business logic from EditableText component into a reusable, testable hook.
 *
 * Features:
 * - Edit mode state management
 * - Validation support with custom validators
 * - Async save with error handling
 * - Automatic value synchronization
 * - Loading state during save
 *
 * Problem Solved:
 * Components should contain minimal logic. This hook extracts all state management,
 * validation, and async operations from the EditableText component, making it a
 * pure presentational component.
 *
 * Example usage:
 * ```typescript
 * const {
 *   isEditing,
 *   editValue,
 *   isSaving,
 *   error,
 *   setEditValue,
 *   startEdit,
 *   cancelEdit,
 *   saveEdit
 * } = useEditableText({
 *   initialValue: 'Current value',
 *   onSave: async (newValue) => { await api.save(newValue); },
 *   validation: (value) => validateNotEmpty(value, 'Name')
 * });
 * ```
 *
 * ===========================================================================================
 */

export interface UseEditableTextOptions {
	/**
	 * The initial/current value of the text
	 */
	initialValue: string;

	/**
	 * Callback to save the new value (async)
	 */
	onSave: (value: string) => Promise<void>;

	/**
	 * Optional validation function
	 * Returns error message if invalid, null if valid
	 */
	validation?: Validator;

	/**
	 * Callback invoked when edit is cancelled
	 */
	onCancel?: () => void;

	/**
	 * Callback invoked after successful save
	 */
	onSuccess?: () => void;

	/**
	 * Callback invoked when save fails
	 */
	onError?: (error: string) => void;
}

export interface UseEditableTextResult {
	/**
	 * Whether the component is currently in edit mode
	 */
	isEditing: boolean;

	/**
	 * The current value being edited
	 */
	editValue: string;

	/**
	 * Whether a save operation is in progress
	 */
	isSaving: boolean;

	/**
	 * Current error message, or null if no error
	 */
	error: string | null;

	/**
	 * Update the edit value
	 */
	setEditValue: (value: string) => void;

	/**
	 * Enter edit mode
	 */
	startEdit: () => void;

	/**
	 * Cancel editing and revert to initial value
	 */
	cancelEdit: () => void;

	/**
	 * Save the current edit value
	 */
	saveEdit: () => Promise<void>;

	/**
	 * Clear the current error
	 */
	clearError: () => void;
}

/**
 * Hook for managing inline text editing state
 *
 * @param options - Configuration options
 * @returns Editing state and control functions
 *
 * @example
 * ```typescript
 * // Basic usage
 * const editing = useEditableText({
 *   initialValue: task.name,
 *   onSave: async (newName) => {
 *     await tasksApi.update(task.id, { name: newName });
 *   }
 * });
 *
 * // With validation
 * const editing = useEditableText({
 *   initialValue: project.title,
 *   onSave: async (newTitle) => {
 *     await projectsApi.update(project.id, { title: newTitle });
 *   },
 *   validation: createValidator(
 *     (v) => validateNotEmpty(v, 'Title'),
 *     (v) => validateMaxLength(v, 100, 'Title')
 *   )
 * });
 *
 * // With callbacks
 * const editing = useEditableText({
 *   initialValue: ingredient.name,
 *   onSave: async (newName) => {
 *     await ingredientsApi.update(ingredient.id, { name: newName });
 *   },
 *   onSuccess: () => showToast('Updated successfully', 'success'),
 *   onError: (error) => showToast(error, 'error')
 * });
 * ```
 */
export function useEditableText({
	initialValue,
	onSave,
	validation,
	onCancel,
	onSuccess,
	onError,
}: UseEditableTextOptions): UseEditableTextResult {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(initialValue);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync editValue when initialValue changes
	useEffect(() => {
		setEditValue(initialValue);
	}, [initialValue]);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	const startEdit = useCallback(() => {
		setEditValue(initialValue);
		setIsEditing(true);
		setError(null);
	}, [initialValue]);

	const cancelEdit = useCallback(() => {
		setIsEditing(false);
		setEditValue(initialValue);
		setError(null);
		onCancel?.();
	}, [initialValue, onCancel]);

	const saveEdit = useCallback(async () => {
		const trimmed = editValue.trim();

		// Check if value actually changed
		if (isUnchanged(editValue, initialValue)) {
			setIsEditing(false);
			return;
		}

		// Run validation if provided
		if (validation) {
			const validationError = validation(trimmed);
			if (validationError) {
				setError(validationError);
				return;
			}
		}

		try {
			setIsSaving(true);
			setError(null);

			await onSave(trimmed);

			setIsEditing(false);
			onSuccess?.();
		} catch (err) {
			const errorMessage = getErrorMessage(err);
			setError(errorMessage);
			onError?.(errorMessage);
		} finally {
			setIsSaving(false);
		}
	}, [editValue, initialValue, onSave, validation, onSuccess, onError]);

	return {
		isEditing,
		editValue,
		isSaving,
		error,
		setEditValue,
		startEdit,
		cancelEdit,
		saveEdit,
		clearError,
	};
}
