import { useEffect, useState } from 'react';

import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';
import { type FormAction, FormActions } from '@framework/features/forms/FormActions';
import { FormContainer } from '@framework/features/forms/FormContainer';
import { CheckboxField } from '@framework/features/forms/fields/CheckboxField';
import { NumberField } from '@framework/features/forms/fields/NumberField';
import { SelectField } from '@framework/features/forms/fields/SelectField';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { useFormState } from '@framework/features/forms/useFormState';
import type { CreateProduct } from '@shared/api/products.contract';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '@shared/api/products.contract';

import { productsService } from './api/ProductsService';

/**
 * ===========================================================================================
 * PRODUCT FORM - Feature Component
 * ===========================================================================================
 *
 * Pure presentation component for product creation/editing.
 * - Receives data via props
 * - Emits events via callbacks
 * - No direct API calls
 * - Focused on domain logic (form validation, field management)
 *
 * Fields:
 * - name (text, required)
 * - description (textarea, required)
 * - category (select, required)
 * - price (number, required, >= 0)
 * - stock (number, required, >= 0)
 * - status (select, required: active/draft/archived)
 * - rating (number, required, 0-5)
 * - imageUrl (text, optional)
 * - featured (checkbox)
 *
 * ===========================================================================================
 */

export interface ProductFormProps {
	onSubmit: (data: CreateProduct) => Promise<void>;
	onCancel: () => void;
	initialData?: CreateProduct;
	submitLabel?: string;
}

const defaultFormData: CreateProduct = {
	name: '',
	description: '',
	category: 'other',
	price: 0,
	stock: 0,
	status: 'draft',
	rating: 0,
	imageUrl: '',
	featured: false,
};

const errorFieldMapping = {
	Name: 'name' as const,
	Description: 'description' as const,
	Category: 'category' as const,
	Price: 'price' as const,
	Stock: 'stock' as const,
	Status: 'status' as const,
	Rating: 'rating' as const,
};

const FORM_ID = 'product-form';

export function ProductForm({ onSubmit, onCancel, initialData, submitLabel = 'Create Product' }: ProductFormProps) {
	// Handle featured checkbox separately since useFormState only supports string | number
	const [featured, setFeatured] = useState(initialData?.featured ?? defaultFormData.featured);

	// Sync featured with initialData changes
	useEffect(() => {
		if (initialData?.featured !== undefined) {
			setFeatured(initialData.featured);
		}
	}, [initialData?.featured]);

	// Wrap onSubmit to include featured field
	const handleSubmitWithFeatured = async (data: Omit<CreateProduct, 'featured'>) => {
		await onSubmit({ ...data, featured } as CreateProduct);
	};

	const { formData, updateField, handleSubmit, isSubmitting, validationErrors } = useFormState({
		defaultData: defaultFormData,
		initialData,
		validator: data => productsService.validateProductData(data),
		errorFieldMapping,
		onSubmit: handleSubmitWithFeatured,
	});

	// Define form actions
	const formActions: FormAction[] = [
		{
			label: isSubmitting ? 'Saving...' : submitLabel,
			type: 'submit',
			formId: FORM_ID,
			disabled: isSubmitting,
		},
		{
			label: 'Cancel',
			type: 'button',
			variant: 'outline',
			onClick: onCancel,
			disabled: isSubmitting,
		},
	];

	// Convert category options
	const categoryOptions = PRODUCT_CATEGORIES.map(cat => ({
		value: cat,
		label: cat.charAt(0).toUpperCase() + cat.slice(1),
	}));

	// Convert status options
	const statusOptions = PRODUCT_STATUSES.map(status => ({
		value: status,
		label: status.charAt(0).toUpperCase() + status.slice(1),
	}));

	return (
		<>
			<DialogBody>
				<FormContainer id={FORM_ID} onSubmit={handleSubmit}>
					<TextField
						label="Name"
						value={formData.name}
						onChange={value => updateField('name', value)}
						placeholder="e.g., Wireless Headphones"
						required
						className="md:col-span-2"
						error={validationErrors.name}
					/>

					<TextAreaField
						label="Description"
						value={formData.description}
						onChange={value => updateField('description', value)}
						placeholder="Detailed product description..."
						required
						className="md:col-span-2"
						rows={3}
						error={validationErrors.description}
					/>

					<SelectField
						label="Category"
						value={formData.category}
						onChange={value => updateField('category', value)}
						options={categoryOptions}
						required
						error={validationErrors.category}
					/>

					<SelectField
						label="Status"
						value={formData.status}
						onChange={value => updateField('status', value)}
						options={statusOptions}
						required
						error={validationErrors.status}
					/>

					<NumberField
						label="Price"
						value={formData.price}
						onChange={value => updateField('price', value)}
						placeholder="0.00"
						required
						step={0.01}
						error={validationErrors.price}
					/>

					<NumberField
						label="Stock"
						value={formData.stock}
						onChange={value => updateField('stock', value)}
						placeholder="0"
						required
						step={1}
						error={validationErrors.stock}
					/>

					<NumberField
						label="Rating"
						value={formData.rating}
						onChange={value => updateField('rating', value)}
						placeholder="0.0"
						required
						step={0.1}
						error={validationErrors.rating}
					/>

					<TextField
						label="Image URL"
						value={formData.imageUrl || ''}
						onChange={value => updateField('imageUrl', value)}
						placeholder="https://example.com/image.jpg"
					/>

					<CheckboxField
						label="Featured Product"
						checked={featured}
						onChange={setFeatured}
						className="md:col-span-2"
					/>
				</FormContainer>
			</DialogBody>

			<DialogFooter>
				<FormActions actions={formActions} isSubmitting={isSubmitting} />
			</DialogFooter>
		</>
	);
}
