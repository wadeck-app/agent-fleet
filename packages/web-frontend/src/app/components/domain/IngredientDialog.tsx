import { useMemo } from 'react';

import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { Button } from '@framework/components/primitives/Button';
import type { CreateIngredient, Ingredient } from '@shared';
import { RefreshCw } from 'lucide-react';

import { IngredientForm } from '@app/pages/ingredients/IngredientForm';

/**
 * ===========================================================================================
 * INGREDIENT DIALOG - Domain-Specific Component
 * ===========================================================================================
 *
 * Dialog wrapper for ingredient creation and editing operations.
 * - Uses CrudDialog for consistent structure and styling
 * - Wraps IngredientForm for domain-specific form logic
 * - Handles both create and edit modes
 * - Determines title/description based on mode
 *
 * Usage:
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

	// Set title based on mode
	const title = isEditMode ? 'Edit Ingredient' : 'New Ingredient';

	// Build header actions (refresh button + version badge)
	const isDev = import.meta.env.DEV;
	const headerActions = isEditMode ? (
		<>
			{onRefresh && (
				<Button
					type="button"
					onClick={onRefresh}
					disabled={isRefreshing}
					variant="ghost"
					size="icon-sm"
					title="Refresh data"
				>
					<RefreshCw
						className={`
       size-4
       ${isRefreshing ? 'animate-spin' : ''}
     `}
					/>
				</Button>
			)}
			{isDev && ingredient?.version !== undefined && (
				<span
					className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
					title="Current version (dev only)"
				>
					v{ingredient.version}
				</span>
			)}
		</>
	) : null;

	// Prepare initial data for the form (only in edit mode)
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
		<CrudDialog
			open={open}
			onOpenChange={open => {
				if (!open) onClose();
			}}
			title={title}
			headerActions={headerActions}
			isRefreshing={isRefreshing}
			maxWidth="2xl"
		>
			<IngredientForm
				onSubmit={onSubmit}
				onCancel={onClose}
				initialData={initialData}
				submitLabel={submitLabel}
			/>
		</CrudDialog>
	);
}
