import { useMemo } from 'react';

import type { CreateIngredient, Ingredient } from '@shared/api/ingredients.contract';

import { IngredientForm } from '@app/pages/ingredients/IngredientForm';

import { EntityDialog } from './EntityDialog';

/**
 * ===========================================================================================
 * INGREDIENT DIALOG - Domain Component
 * ===========================================================================================
 *
 * Wraps IngredientForm in an EntityDialog for consistent dialog behavior.
 * - Uses EntityDialog for structure, title generation, and header actions
 * - Prepares initial data for IngredientForm in edit mode
 * - Delegates all form logic to IngredientForm
 *
 * **Refactored:** Now uses generic EntityDialog wrapper, eliminating ~60 lines of
 * duplicated dialog boilerplate.
 *
 * **Usage:**
 * ```tsx
 * <IngredientDialog
 *   open={isOpen}
 *   onClose={() => navigate('/ingredients')}
 *   ingredient={editingIngredient}
 *   onSubmit={handleSubmit}
 *   onRefresh={handleRefresh}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface IngredientDialogProps {
	open: boolean;
	onClose: () => void;
	ingredient?: Ingredient | null;
	onSubmit: (data: CreateIngredient) => Promise<void>;
	onRefresh?: () => void;
	isRefreshing?: boolean;
}

export function IngredientDialog({
	open,
	onClose,
	ingredient,
	onSubmit,
	onRefresh,
	isRefreshing = false,
}: IngredientDialogProps) {
	// Determine mode based on whether an ingredient is being edited
	const isEditMode = !!ingredient;

	// Prepare initial data for the form (only in edit mode)
	// Memoized to prevent unnecessary form resets
	const initialData = useMemo(() => {
		if (!ingredient) return undefined;
		return {
			name: ingredient.name,
			calories: ingredient.calories,
			protein: ingredient.protein,
			carbs: ingredient.carbs,
			fat: ingredient.fat,
			servingSize: ingredient.servingSize,
			unit: ingredient.unit,
			category: ingredient.category,
		};
	}, [ingredient]);

	// Set submit label based on mode
	const submitLabel = isEditMode ? 'Update Ingredient' : 'Create Ingredient';

	return (
		<EntityDialog
			open={open}
			onClose={onClose}
			entity={ingredient}
			entityName="Ingredient"
			onRefresh={onRefresh}
			isRefreshing={isRefreshing}
			maxWidth="2xl"
		>
			<IngredientForm
				onSubmit={onSubmit}
				onCancel={onClose}
				initialData={initialData}
				submitLabel={submitLabel}
			/>
		</EntityDialog>
	);
}
