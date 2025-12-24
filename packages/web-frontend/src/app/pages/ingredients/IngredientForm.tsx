import { FormContainer } from '@framework/features/forms/FormContainer';
import { IntegerField } from '@framework/features/forms/fields/IntegerField';
import { NumberField } from '@framework/features/forms/fields/NumberField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { useFormState } from '@framework/features/forms/useFormState';
import type { CreateIngredient } from '@shared/api/ingredients.contract';

import { ingredientsService } from './IngredientsService';

/**
 * ===========================================================================================
 * INGREDIENT FORM - Feature Component
 * ===========================================================================================
 *
 * Pure presentation component for ingredient creation/editing.
 * - Receives data via props
 * - Emits events via callbacks
 * - No direct API calls
 * - Focused on domain logic (form validation, field management)
 *
 * ===========================================================================================
 */

export interface IngredientFormProps {
	onSubmit: (data: CreateIngredient) => Promise<void>;
	onCancel: () => void;
	initialData?: CreateIngredient;
	submitLabel?: string;
}

const defaultFormData: CreateIngredient = {
	name: '',
	calories: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	servingSize: 100,
	unit: 'g',
	category: '',
};

const errorFieldMapping = {
	Name: 'name' as const,
	Calories: 'calories' as const,
	Protein: 'protein' as const,
	Carbs: 'carbs' as const,
	Fat: 'fat' as const,
	'Serving size': 'servingSize' as const,
};

export function IngredientForm({
	onSubmit,
	onCancel,
	initialData,
	submitLabel = 'Create Ingredient',
}: IngredientFormProps) {
	const { formData, updateField, handleSubmit, isSubmitting, validationErrors } = useFormState({
		defaultData: defaultFormData,
		initialData,
		validator: data => ingredientsService.validateIngredientData(data),
		errorFieldMapping,
		onSubmit,
	});

	return (
		<FormContainer
			isSubmitting={isSubmitting}
			onSubmit={handleSubmit}
			onCancel={onCancel}
			submitLabel={submitLabel}
		>
			<TextField
				label="Name"
				value={formData.name}
				onChange={value => updateField('name', value)}
				placeholder="e.g., Chicken Breast"
				required
				className="md:col-span-2"
				error={validationErrors.name}
			/>

			<IntegerField
				label="Calories (kcal)"
				value={formData.calories}
				onChange={value => updateField('calories', value)}
				placeholder="0"
				required
				error={validationErrors.calories}
			/>

			<NumberField
				label="Protein (g)"
				value={formData.protein}
				onChange={value => updateField('protein', value)}
				placeholder="0.0"
				required
				error={validationErrors.protein}
				step={0.1}
			/>

			<NumberField
				label="Carbs (g)"
				value={formData.carbs}
				onChange={value => updateField('carbs', value)}
				placeholder="0.0"
				required
				error={validationErrors.carbs}
				step={0.1}
			/>

			<NumberField
				label="Fat (g)"
				value={formData.fat}
				onChange={value => updateField('fat', value)}
				placeholder="0.0"
				required
				error={validationErrors.fat}
				step={0.1}
			/>

			<IntegerField
				label="Serving Size"
				value={formData.servingSize}
				onChange={value => updateField('servingSize', value)}
				placeholder="100"
				required
				error={validationErrors.servingSize}
			/>

			<TextField
				label="Unit"
				value={formData.unit || ''}
				onChange={value => updateField('unit', value)}
				placeholder="g, ml, oz..."
			/>

			<TextField
				label="Category"
				value={formData.category || ''}
				onChange={value => updateField('category', value)}
				placeholder="e.g., Protein, Vegetables"
				className="md:col-span-2"
			/>
		</FormContainer>
	);
}
