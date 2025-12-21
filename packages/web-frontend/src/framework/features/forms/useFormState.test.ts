import { createControllablePromise } from '@framework/tests/createControllablePromise';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFormState } from './useFormState';
import type { ValidationResult } from './useFormState';

interface TestFormData {
	name: string;
	age: number;
	email: string;
}

describe('useFormState', () => {
	const defaultData: TestFormData = {
		name: '',
		age: 0,
		email: '',
	};

	const mockValidator = vi.fn<(data: TestFormData) => ValidationResult>();
	const mockOnSubmit = vi.fn<(data: TestFormData) => Promise<void>>();

	const errorFieldMapping = {
		Name: 'name' as const,
		Age: 'age' as const,
		Email: 'email' as const,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockValidator.mockReturnValue({ valid: true, errors: [] });
		mockOnSubmit.mockResolvedValue(undefined);
	});

	describe('initialization', () => {
		it('should initialize with default data', () => {
			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			expect(result.current.formData).toEqual(defaultData);
			expect(result.current.isSubmitting).toBe(false);
			expect(result.current.validationErrors).toEqual({});
		});

		it('should initialize with initial data when provided', () => {
			const initialData: TestFormData = {
				name: 'John',
				age: 30,
				email: 'john@example.com',
			};

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					initialData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			expect(result.current.formData).toEqual(initialData);
		});
	});

	describe('updateField', () => {
		it('should update string fields', () => {
			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			act(() => {
				result.current.updateField('name', 'Alice');
			});

			expect(result.current.formData.name).toBe('Alice');
			expect(result.current.formData.age).toBe(0);
			expect(result.current.formData.email).toBe('');
		});

		it('should update number fields', () => {
			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			act(() => {
				result.current.updateField('age', 25);
			});

			expect(result.current.formData.age).toBe(25);
		});

		it('should update multiple fields independently', () => {
			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			act(() => {
				result.current.updateField('name', 'Bob');
				result.current.updateField('age', 35);
				result.current.updateField('email', 'bob@example.com');
			});

			expect(result.current.formData).toEqual({
				name: 'Bob',
				age: 35,
				email: 'bob@example.com',
			});
		});
	});

	describe('real-time validation', () => {
		it('should call validator when form data changes', () => {
			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			// Initial call
			expect(mockValidator).toHaveBeenCalledWith(defaultData);

			act(() => {
				result.current.updateField('name', 'Test');
			});

			// Should be called again with updated data
			expect(mockValidator).toHaveBeenCalledWith({
				...defaultData,
				name: 'Test',
			});
		});
	});

	describe('handleSubmit', () => {
		it('should prevent default form submission', async () => {
			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(mockEvent.preventDefault).toHaveBeenCalledOnce();
		});

		it('should submit valid form data', async () => {
			mockValidator.mockReturnValue({ valid: true, errors: [] });

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			// Update form data
			act(() => {
				result.current.updateField('name', 'Valid Name');
			});

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(mockOnSubmit).toHaveBeenCalledWith({
				name: 'Valid Name',
				age: 0,
				email: '',
			});
		});

		it('should set isSubmitting during submission', async () => {
			mockValidator.mockReturnValue({ valid: true, errors: [] });

			// Create controllable promise for deterministic async control
			const { fn: controllableSubmit, resolve } = createControllablePromise<[TestFormData], void>();
			mockOnSubmit.mockImplementation(controllableSubmit);

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			act(() => {
				result.current.handleSubmit(mockEvent);
			});

			// Should be submitting
			await waitFor(() => {
				expect(result.current.isSubmitting).toBe(true);
			});

			// Resolve submission when ready
			act(() => {
				resolve();
			});

			// Should no longer be submitting
			await waitFor(() => {
				expect(result.current.isSubmitting).toBe(false);
			});
		});

		it('should reset form after successful submission', async () => {
			mockValidator.mockReturnValue({ valid: true, errors: [] });

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			// Update form data
			act(() => {
				result.current.updateField('name', 'Test Name');
				result.current.updateField('age', 25);
			});

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			// Form should be reset to default
			expect(result.current.formData).toEqual(defaultData);
		});

		it('should not submit when validation fails', async () => {
			mockValidator.mockReturnValue({
				valid: false,
				errors: ['Name is required', 'Age must be positive'],
			});

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(mockOnSubmit).not.toHaveBeenCalled();
		});

		it('should set validation errors when validation fails', async () => {
			mockValidator.mockReturnValue({
				valid: false,
				errors: ['Name is required', 'Age must be positive'],
			});

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(result.current.validationErrors).toEqual({
				name: 'Name is required',
				age: 'Age must be positive',
			});
		});

		it('should clear validation errors before successful submission', async () => {
			// Use a validator that actually validates based on data
			const dynamicValidator = vi.fn((data: TestFormData) => {
				if (!data.name) {
					return { valid: false, errors: ['Name is required'] };
				}
				return { valid: true, errors: [] };
			});

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: dynamicValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			// First submission fails (name is empty)
			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(result.current.validationErrors.name).toBe('Name is required');

			// Fix the data
			act(() => {
				result.current.updateField('name', 'Valid Name');
			});

			// Second submission succeeds (name is now valid)
			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(result.current.validationErrors).toEqual({});
		});

		it('should handle submission errors', async () => {
			mockValidator.mockReturnValue({ valid: true, errors: [] });
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const error = new Error('Network error');
			mockOnSubmit.mockRejectedValue(error);

			const { result } = renderHook(() =>
				useFormState({
					defaultData,
					validator: mockValidator,
					errorFieldMapping,
					onSubmit: mockOnSubmit,
				})
			);

			const mockEvent = {
				preventDefault: vi.fn(),
			} as unknown as React.FormEvent;

			await act(async () => {
				await result.current.handleSubmit(mockEvent);
			});

			expect(consoleErrorSpy).toHaveBeenCalledWith('Form submission error:', error);
			expect(result.current.isSubmitting).toBe(false);

			consoleErrorSpy.mockRestore();
		});
	});
});
