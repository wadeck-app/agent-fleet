import { useEffect, useState } from 'react';

/**
 * ===========================================================================================
 * USE ROUTED DIALOG - URL-Based Dialog State Management Hook
 * ===========================================================================================
 *
 * Synchronizes dialog open/close state with URL parameters for CRUD operations.
 * - Monitors URL mode ('new', 'edit', or undefined) and id parameters
 * - Automatically finds and sets the item being edited
 * - Handles dialog open/close based on URL state
 * - Provides seamless back navigation
 *
 * Problem Solved:
 * CRUD dialogs often need to open/close based on URL state to support:
 * - Direct URL linking (e.g., /ingredients/edit/123)
 * - Browser back/forward navigation
 * - Bookmarking specific edit states
 *
 * This hook eliminates the repetitive useEffect pattern for URL-based dialog management.
 *
 * Example usage:
 * ```typescript
 * // Before: Complex useEffect with URL synchronization
 * const { id, mode } = useParams();
 * const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
 * const isDialogOpen = mode === 'new' || (mode === 'edit' && id !== undefined);
 *
 * useEffect(() => {
 *   if (mode === 'edit' && id && ingredients.length > 0) {
 *     const ingredient = ingredients.find(i => i.id === id);
 *     if (ingredient) {
 *       setEditingIngredient(ingredient);
 *     }
 *   } else if (mode === 'new') {
 *     setEditingIngredient(null);
 *   } else if (!mode && editingIngredient) {
 *     setEditingIngredient(null);
 *   }
 * }, [id, mode, ingredients, editingIngredient]);
 *
 * // After: Clean one-liner
 * const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
 *   mode,
 *   id,
 *   items: ingredients,
 *   findItem: (items, id) => items.find(i => i.id === id),
 *   onNavigateBack: () => navigate('/ingredients'),
 * });
 * ```
 *
 * ===========================================================================================
 */

export interface UseRoutedDialogOptions<T> {
	/**
	 * Current mode from URL params ('new', 'edit', or undefined)
	 */
	mode: 'new' | 'edit' | undefined;

	/**
	 * Item ID from URL params (present when mode is 'edit')
	 */
	id: string | undefined;

	/**
	 * Array of items to search for the editing item
	 */
	items: T[];

	/**
	 * Function to find an item by ID in the items array
	 */
	findItem: (items: T[], id: string) => T | undefined;

	/**
	 * Function to call when navigating back (closing the dialog)
	 */
	onNavigateBack: () => void;
}

export interface UseRoutedDialogResult<T> {
	/**
	 * Whether the dialog should be open (derived from URL state)
	 */
	isOpen: boolean;

	/**
	 * The item currently being edited, or null if creating new
	 */
	editingItem: T | null;

	/**
	 * Function to manually set the editing item (rarely needed)
	 */
	setEditingItem: (item: T | null) => void;
}

/**
 * Hook that synchronizes dialog state with URL parameters for CRUD operations
 *
 * @param options - Configuration object with mode, id, items, findItem, and onNavigateBack
 * @returns Object containing isOpen, editingItem, and setEditingItem
 *
 * @example
 * ```typescript
 * // In IngredientsPage
 * const { id, mode } = useParams<{ id?: string; mode?: string }>();
 * const navigate = useNavigate();
 * const { ingredients } = useIngredients();
 *
 * const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
 *   mode,
 *   id,
 *   items: ingredients,
 *   findItem: (items, id) => items.find(i => i.id === id),
 *   onNavigateBack: () => navigate('/ingredients'),
 * });
 * ```
 */
export function useRoutedDialog<T>({
	mode,
	id,
	items,
	findItem,
	onNavigateBack: _onNavigateBack,
}: UseRoutedDialogOptions<T>): UseRoutedDialogResult<T> {
	const [editingItem, setEditingItem] = useState<T | null>(null);

	// Dialog is open if mode is 'new' or 'edit' with an id
	const isOpen = mode === 'new' || (mode === 'edit' && id !== undefined);

	// Handle URL-based editing
	useEffect(() => {
		if (mode === 'edit' && id && items.length > 0) {
			const item = findItem(items, id);
			if (item) {
				// Always update editingItem when the item in the list changes
				// This allows refresh functionality to work properly
				setEditingItem(item);
			}
		} else if (mode === 'new') {
			setEditingItem(null);
		} else if (!mode && editingItem) {
			// When navigating back, close the form
			setEditingItem(null);
		}
	}, [id, mode, items, editingItem, findItem]);

	return {
		isOpen,
		editingItem,
		setEditingItem,
	};
}
