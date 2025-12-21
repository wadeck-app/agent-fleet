import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ===========================================================================================
 * USE FORM STATE HOOK
 * ===========================================================================================
 *
 * Generic hook for managing form state, validation, and submission.
 * Eliminates duplication across form components.
 *
 * Usage:
 * ```tsx
 * const formState = useFormState({
 *   defaultData: { name: '', age: 0 },
 *   validator: (data) => service.validate(data),
 *   errorFieldMapping: { 'Name': 'name', 'Age': 'age' },
 *   onSubmit: async (data) => await api.create(data)
 * });
 * ```
 *
 * ===========================================================================================
 */

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

export interface UseFormStateConfig<T> {
	defaultData: T;
	initialData?: T;
	validator: (data: T) => ValidationResult;
	errorFieldMapping: Record<string, keyof T>;
	onSubmit: (data: T) => Promise<void>;
}

export interface UseFormStateReturn<T> {
	formData: T;
	updateField: (field: keyof T, value: string | number) => void;
	handleSubmit: (e: React.FormEvent) => Promise<void>;
	isSubmitting: boolean;
	validationErrors: Record<string, string>;
}

export function useFormState<T>({
	defaultData,
	initialData,
	validator,
	errorFieldMapping,
	onSubmit,
}: UseFormStateConfig<T>): UseFormStateReturn<T> {
	// Merge initialData with defaultData to handle undefined optional fields
	const mergeWithDefaults = useCallback(
		(data: T | undefined): T => {
			if (!data) return defaultData;
			// Merge to ensure undefined fields get default values
			return { ...defaultData, ...data };
		},
		[defaultData]
	);

	const [formData, setFormData] = useState<T>(() => mergeWithDefaults(initialData));
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

	// Track previous initialData to detect changes
	const prevInitialDataRef = useRef(initialData);
	// Track if user has modified the form (form is "dirty")
	const isDirtyRef = useRef(false);

	// Update formData when initialData changes, but preserve user modifications
	useEffect(() => {
		// Only update if initialData actually changed (not just a re-render)
		if (initialData !== prevInitialDataRef.current) {
			// If form has user modifications, DON'T reset it (preserve user changes)
			// This prevents losing unsaved changes when parent updates initialData
			// (e.g., during partial updates in edit mode)
			if (!isDirtyRef.current) {
				setFormData(mergeWithDefaults(initialData));
			}
			prevInitialDataRef.current = initialData;
		}
	}, [initialData, mergeWithDefaults]);

	// Real-time validation
	const validation = validator(formData);

	const updateField = (field: keyof T, value: string | number) => {
		// Mark form as dirty when user modifies any field
		isDirtyRef.current = true;
		setFormData(prev => ({ ...prev, [field]: value }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Check validation before submission
		if (!validation.valid) {
			// Convert errors array to object for field-specific display
			const errors: Record<string, string> = {};
			validation.errors.forEach(error => {
				// Find matching field from error message
				Object.entries(errorFieldMapping).forEach(([errorKey, fieldName]) => {
					if (error.includes(errorKey)) {
						errors[fieldName as string] = error;
					}
				});
			});
			setValidationErrors(errors);
			return;
		}

		setIsSubmitting(true);
		setValidationErrors({});

		try {
			await onSubmit(formData);
			// Reset form on success
			setFormData(defaultData);
			// Clear dirty flag on successful submission
			isDirtyRef.current = false;
		} catch (err) {
			// Error handling is done by parent
			console.error('Form submission error:', err);
		} finally {
			setIsSubmitting(false);
		}
	};

	return {
		formData,
		updateField,
		handleSubmit,
		isSubmitting,
		validationErrors,
	};
}
