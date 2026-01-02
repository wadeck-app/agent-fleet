import { useToast } from '@framework/features/toast/ToastContext';

/**
 * ===========================================================================================
 * USE CRUD SUCCESS TOAST - Success Toast Helper Hook
 * ===========================================================================================
 *
 * Provides convenient helper functions to show success toasts for CRUD operations.
 * This hook standardizes success message patterns across the application for better UX.
 *
 * Problem Solved:
 * - Inconsistent success messages across pages
 * - Repetitive toast code in CRUD handlers
 * - No user feedback on successful operations
 *
 * Example usage:
 * ```typescript
 * const successToast = useCrudSuccessToast('ingredient');
 *
 * // In handlers:
 * await createIngredient(data);
 * successToast.created();
 *
 * await updateIngredient(id, data);
 * successToast.updated();
 *
 * await deleteIngredient(id);
 * successToast.deleted();
 * ```
 *
 * ===========================================================================================
 */

export interface CrudSuccessToast {
	/**
	 * Show success toast for create operation
	 */
	created: () => void;

	/**
	 * Show success toast for update operation
	 */
	updated: () => void;

	/**
	 * Show success toast for delete operation
	 */
	deleted: () => void;

	/**
	 * Show a custom success toast
	 */
	custom: (message: string) => void;
}

/**
 * Hook that provides standardized success toast messages for CRUD operations
 *
 * @param itemTypeName - The name of the item type (e.g., 'ingredient', 'book', 'worker')
 * @returns Object with helper methods for showing success toasts
 *
 * @example
 * ```typescript
 * const successToast = useCrudSuccessToast('ingredient');
 *
 * const handleSubmit = async (data) => {
 *   if (isEditing) {
 *     await updateIngredient(id, data);
 *     successToast.updated();
 *   } else {
 *     await createIngredient(data);
 *     successToast.created();
 *   }
 * };
 *
 * const handleDelete = async (id) => {
 *   await deleteIngredient(id);
 *   successToast.deleted();
 * };
 * ```
 */
export function useCrudSuccessToast(itemTypeName: string): CrudSuccessToast {
	const { showToast } = useToast();

	// Capitalize first letter for display
	const capitalizedName = itemTypeName.charAt(0).toUpperCase() + itemTypeName.slice(1);

	return {
		created: () => showToast(`${capitalizedName} created successfully`, 'success'),
		updated: () => showToast(`${capitalizedName} updated successfully`, 'success'),
		deleted: () => showToast(`${capitalizedName} deleted successfully`, 'success'),
		custom: (message: string) => showToast(message, 'success'),
	};
}
