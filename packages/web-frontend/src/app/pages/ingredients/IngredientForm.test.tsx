import type { CreateIngredient } from '@shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IngredientForm } from './IngredientForm';

describe('IngredientForm', () => {
	const defaultProps = {
		onSubmit: vi.fn<(data: CreateIngredient) => Promise<void>>().mockResolvedValue(undefined),
		onCancel: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('component wiring', () => {
		it('should wire form submission correctly with all components', async () => {
			const onSubmit = vi.fn<(data: CreateIngredient) => Promise<void>>().mockResolvedValue(undefined);
			render(<IngredientForm {...defaultProps} onSubmit={onSubmit} />);

			// Fill in form fields
			fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Salmon' } });
			fireEvent.change(screen.getByLabelText(/calories/i), { target: { value: '208' } });
			fireEvent.change(screen.getByLabelText(/protein/i), { target: { value: '20.5' } });
			fireEvent.change(screen.getByLabelText(/carbs/i), { target: { value: '0' } });
			fireEvent.change(screen.getByLabelText(/fat/i), { target: { value: '13.4' } });
			fireEvent.change(screen.getByLabelText(/serving size/i), { target: { value: '100' } });
			fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: 'g' } });
			fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Protein' } });

			// Submit form
			const submitButton = screen.getByRole('button', { name: /create ingredient/i });
			fireEvent.click(submitButton);

			// Verify onSubmit receives correct data with correct types
			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalledWith({
					name: 'Salmon',
					calories: 208,
					protein: 20.5,
					carbs: 0,
					fat: 13.4,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
				});
			});
		});

		it('should wire initialData correctly through all components', () => {
			const initialData: CreateIngredient = {
				name: 'Chicken Breast',
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			};

			render(<IngredientForm {...defaultProps} initialData={initialData} />);

			expect(screen.getByDisplayValue('Chicken Breast')).toBeInTheDocument();
			expect(screen.getByDisplayValue('165')).toBeInTheDocument();
			expect(screen.getByDisplayValue('31')).toBeInTheDocument();
			expect(screen.getByDisplayValue('0')).toBeInTheDocument();
			expect(screen.getByDisplayValue('3.6')).toBeInTheDocument();
			expect(screen.getByDisplayValue('100')).toBeInTheDocument();
			expect(screen.getByDisplayValue('g')).toBeInTheDocument();
			expect(screen.getByDisplayValue('Protein')).toBeInTheDocument();
		});

		it('should wire custom submitLabel correctly', () => {
			render(<IngredientForm {...defaultProps} submitLabel="Update Ingredient" />);

			expect(screen.getByRole('button', { name: /update ingredient/i })).toBeInTheDocument();
		});
	});
});
