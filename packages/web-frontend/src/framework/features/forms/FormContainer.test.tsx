import { createControllablePromise } from '@framework/tests/createControllablePromise';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormContainerLegacy } from './FormContainer';
import { useFormState } from './useFormState';

describe('FormContainerLegacy', () => {
	const defaultProps = {
		isSubmitting: false,
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
		submitLabel: 'Submit',
		children: <div>Form content</div>,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render children content', () => {
			render(<FormContainerLegacy {...defaultProps} />);

			expect(screen.getByText('Form content')).toBeInTheDocument();
		});

		it('should render submit button with correct label', () => {
			render(<FormContainerLegacy {...defaultProps} />);

			expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
		});

		it('should render cancel button', () => {
			render(<FormContainerLegacy {...defaultProps} />);

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});
	});

	describe('submit button states', () => {
		it('should show submit label when not submitting', () => {
			render(<FormContainerLegacy {...defaultProps} submitLabel="Create Item" />);

			expect(screen.getByRole('button', { name: 'Create Item' })).toBeInTheDocument();
		});

		it('should show "Saving..." when submitting', () => {
			render(<FormContainerLegacy {...defaultProps} isSubmitting={true} />);

			expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument();
		});

		it('should disable submit button when submitting', () => {
			render(<FormContainerLegacy {...defaultProps} isSubmitting={true} />);

			const submitButton = screen.getByRole('button', { name: 'Saving...' });
			expect(submitButton).toBeDisabled();
		});

		it('should enable submit button when not submitting', () => {
			render(<FormContainerLegacy {...defaultProps} isSubmitting={false} />);

			const submitButton = screen.getByRole('button', { name: 'Submit' });
			expect(submitButton).not.toBeDisabled();
		});
	});

	describe('cancel button states', () => {
		it('should disable cancel button when submitting', () => {
			render(<FormContainerLegacy {...defaultProps} isSubmitting={true} />);

			const cancelButton = screen.getByRole('button', { name: 'Cancel' });
			expect(cancelButton).toBeDisabled();
		});

		it('should enable cancel button when not submitting', () => {
			render(<FormContainerLegacy {...defaultProps} isSubmitting={false} />);

			const cancelButton = screen.getByRole('button', { name: 'Cancel' });
			expect(cancelButton).not.toBeDisabled();
		});
	});

	describe('interactions', () => {
		it('should call onSubmit when form is submitted', () => {
			const onSubmit = vi.fn(e => e.preventDefault());
			render(<FormContainerLegacy {...defaultProps} onSubmit={onSubmit} />);

			const form = screen.getByText('Form content').closest('form');
			expect(form).toBeInTheDocument();

			fireEvent.submit(form!);

			expect(onSubmit).toHaveBeenCalledOnce();
		});

		it('should call onCancel when cancel button is clicked', () => {
			const onCancel = vi.fn();
			render(<FormContainerLegacy {...defaultProps} onCancel={onCancel} />);

			const cancelButton = screen.getByRole('button', { name: 'Cancel' });
			fireEvent.click(cancelButton);

			expect(onCancel).toHaveBeenCalledOnce();
		});

		it('should not call onCancel when cancel button is disabled', () => {
			const onCancel = vi.fn();
			render(<FormContainerLegacy {...defaultProps} onCancel={onCancel} isSubmitting={true} />);

			const cancelButton = screen.getByRole('button', { name: 'Cancel' });
			fireEvent.click(cancelButton);

			expect(onCancel).not.toHaveBeenCalled();
		});
	});

	describe('layout', () => {
		it('should render children in a grid layout', () => {
			const { container } = render(
				<FormContainerLegacy {...defaultProps}>
					<div data-testid="field-1">Field 1</div>
					<div data-testid="field-2">Field 2</div>
				</FormContainerLegacy>
			);

			const grid = container.querySelector('.grid');
			expect(grid).toBeInTheDocument();
			expect(screen.getByTestId('field-1')).toBeInTheDocument();
			expect(screen.getByTestId('field-2')).toBeInTheDocument();
		});

		it('should render form with proper flex constraints for scrolling', () => {
			const { container } = render(<FormContainerLegacy {...defaultProps} />);

			const form = container.querySelector('form');
			expect(form).toBeInTheDocument();

			// Verify the form has the correct flex classes for proper height constraints
			// The form should have flex-1 and min-h-0 to properly constrain height in flex container
			expect(form).toHaveClass('flex', 'flex-1', 'min-h-0', 'flex-col');
		});
	});

	describe('integration with useFormState', () => {
		interface TestFormData {
			name: string;
		}

		// Minimal form component using FormContainer + useFormState
		function TestForm({ onSubmit }: { onSubmit: (data: TestFormData) => Promise<void> }) {
			const { formData, updateField, isSubmitting, handleSubmit } = useFormState({
				defaultData: { name: '' },
				validator: () => ({ valid: true, errors: [] }),
				errorFieldMapping: {},
				onSubmit,
			});

			return (
				<FormContainerLegacy
					isSubmitting={isSubmitting}
					onSubmit={handleSubmit}
					onCancel={() => {}}
					submitLabel="Create"
				>
					<input
						type="text"
						value={formData.name}
						onChange={e => updateField('name', e.target.value)}
						placeholder="Name"
					/>
				</FormContainerLegacy>
			);
		}

		it('should show loading state during submission and clear after completion', async () => {
			// Create controllable promise for deterministic async control
			const { fn: onSubmit, resolve } = createControllablePromise<[TestFormData], void>();

			render(<TestForm onSubmit={onSubmit} />);

			// Fill and submit form
			const input = screen.getByPlaceholderText('Name');
			fireEvent.change(input, { target: { value: 'Test Name' } });
			fireEvent.click(screen.getByRole('button', { name: /create/i }));

			// Verify loading state appears
			expect(screen.getByText(/saving.../i)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /saving.../i })).toBeDisabled();

			// Complete the promise when ready (no race conditions, no arbitrary timeout)
			resolve();

			// Verify loading state disappears
			await waitFor(() => {
				expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
			});

			// Verify button is enabled again
			const submitButton = screen.getByRole('button', { name: /create/i });
			expect(submitButton).not.toBeDisabled();
		});

		it('should handle submission errors gracefully', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			// Create controllable promise that we can reject
			const { fn: onSubmit, reject } = createControllablePromise<[TestFormData], void>();

			render(<TestForm onSubmit={onSubmit} />);

			// Fill and submit form
			const input = screen.getByPlaceholderText('Name');
			fireEvent.change(input, { target: { value: 'Test Name' } });
			fireEvent.click(screen.getByRole('button', { name: /create/i }));

			// Verify loading state
			expect(screen.getByText(/saving.../i)).toBeInTheDocument();

			// Reject the promise to simulate an error
			const error = new Error('Network error');
			reject(error);

			// Verify loading state clears after error
			await waitFor(() => {
				expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
			});

			// Verify button is enabled again (user can retry)
			const submitButton = screen.getByRole('button', { name: /create/i });
			expect(submitButton).not.toBeDisabled();

			consoleErrorSpy.mockRestore();
		});

		it('should disable cancel button during submission', async () => {
			const { fn: onSubmit, resolve } = createControllablePromise<[TestFormData], void>();

			render(<TestForm onSubmit={onSubmit} />);

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			expect(cancelButton).not.toBeDisabled();

			// Submit form
			const input = screen.getByPlaceholderText('Name');
			fireEvent.change(input, { target: { value: 'Test Name' } });
			fireEvent.click(screen.getByRole('button', { name: /create/i }));

			// Cancel should be disabled during submission
			expect(cancelButton).toBeDisabled();

			// Complete submission
			resolve();

			// Cancel should be enabled again
			await waitFor(() => {
				expect(cancelButton).not.toBeDisabled();
			});
		});
	});
});
