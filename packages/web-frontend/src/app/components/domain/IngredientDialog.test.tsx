import type { CreateIngredient, Ingredient } from '@shared/api/ingredients.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IngredientDialog } from './IngredientDialog';

// Mock the IngredientForm component
vi.mock('../../pages/ingredients/IngredientForm', () => ({
	IngredientForm: ({
		onSubmit,
		onCancel,
		onRefresh,
		initialData,
		submitLabel,
	}: {
		onSubmit: (data: CreateIngredient) => Promise<void>;
		onCancel: () => void;
		onRefresh?: () => void;
		initialData?: CreateIngredient;
		submitLabel?: string;
	}) => (
		<div data-testid="ingredient-form">
			<div data-testid="form-mode">{initialData ? 'edit' : 'create'}</div>
			<div data-testid="form-submit-label">{submitLabel}</div>
			<div data-testid="form-initial-data">{initialData ? JSON.stringify(initialData) : 'none'}</div>
			<button data-testid="form-submit" onClick={() => onSubmit({} as CreateIngredient)}>
				Submit
			</button>
			<button data-testid="form-cancel" onClick={onCancel}>
				Cancel
			</button>
			{onRefresh && (
				<button data-testid="form-refresh" onClick={onRefresh}>
					Refresh
				</button>
			)}
		</div>
	),
}));

describe('IngredientDialog', () => {
	const mockIngredient: Ingredient = {
		id: '1',
		name: 'Chicken Breast',
		calories: 165,
		protein: 31,
		carbs: 0,
		fat: 3.6,
		servingSize: 100,
		unit: 'g',
		category: 'Protein',
		version: 1,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	};

	describe('rendering', () => {
		it('should render in create mode when no ingredient is provided', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();
			expect(screen.getByTestId('ingredient-form')).toBeInTheDocument();
		});

		it('should render in edit mode when ingredient is provided', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />);

			expect(screen.getByText('Edit Ingredient')).toBeInTheDocument();
			expect(screen.getByTestId('ingredient-form')).toBeInTheDocument();
		});

		it('should not render when open is false', () => {
			render(<IngredientDialog open={false} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.queryByText('New Ingredient')).not.toBeInTheDocument();
			expect(screen.queryByTestId('ingredient-form')).not.toBeInTheDocument();
		});

		it('should render with undefined ingredient (create mode)', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={undefined} />);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();
			expect(screen.getByTestId('form-mode')).toHaveTextContent('create');
		});
	});

	describe('form integration', () => {
		it('should pass correct submit label in create mode', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.getByTestId('form-submit-label')).toHaveTextContent('Create Ingredient');
		});

		it('should pass correct submit label in edit mode', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />);

			expect(screen.getByTestId('form-submit-label')).toHaveTextContent('Update Ingredient');
		});

		it('should pass initial data in edit mode', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />);

			const initialDataElement = screen.getByTestId('form-initial-data');
			const parsedData = JSON.parse(initialDataElement.textContent || '{}');

			expect(parsedData).toEqual({
				name: 'Chicken Breast',
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			});
		});

		it('should not pass initial data in create mode', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.getByTestId('form-initial-data')).toHaveTextContent('none');
		});

		it('should pass onRefresh in edit mode', () => {
			const handleRefresh = vi.fn();
			render(
				<IngredientDialog
					open={true}
					onClose={vi.fn()}
					onSubmit={vi.fn()}
					ingredient={mockIngredient}
					onRefresh={handleRefresh}
				/>
			);

			expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
		});

		it('should not pass onRefresh in create mode', () => {
			const handleRefresh = vi.fn();
			render(
				<IngredientDialog
					open={true}
					onClose={vi.fn()}
					onSubmit={vi.fn()}
					ingredient={null}
					onRefresh={handleRefresh}
				/>
			);
		});

		it('should not pass onRefresh when not provided even in edit mode', () => {
			render(
				<IngredientDialog
					open={true}
					onClose={vi.fn()}
					onSubmit={vi.fn()}
					ingredient={mockIngredient}
					onRefresh={undefined}
				/>
			);
		});
	});

	describe('callbacks', () => {
		it('should call onClose when form cancel is clicked', () => {
			const handleClose = vi.fn();
			render(<IngredientDialog open={true} onClose={handleClose} onSubmit={vi.fn()} ingredient={null} />);

			const cancelButton = screen.getByTestId('form-cancel');
			fireEvent.click(cancelButton);

			expect(handleClose).toHaveBeenCalledTimes(1);
		});

		it('should call onSubmit when form is submitted', async () => {
			const handleSubmit = vi.fn().mockResolvedValue(undefined);
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={handleSubmit} ingredient={null} />);

			const submitButton = screen.getByTestId('form-submit');
			fireEvent.click(submitButton);

			await waitFor(() => {
				expect(handleSubmit).toHaveBeenCalledTimes(1);
			});
		});

		it('should call onRefresh when refresh button is clicked in edit mode', () => {
			const handleRefresh = vi.fn();
			render(
				<IngredientDialog
					open={true}
					onClose={vi.fn()}
					onSubmit={vi.fn()}
					ingredient={mockIngredient}
					onRefresh={handleRefresh}
				/>
			);

			const refreshButton = screen.getByRole('button', { name: /refresh/i });
			fireEvent.click(refreshButton);

			expect(handleRefresh).toHaveBeenCalledTimes(1);
		});

		it('should handle async onSubmit errors', async () => {
			const handleSubmit = vi.fn().mockRejectedValue(new Error('Submission failed'));
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={handleSubmit} ingredient={null} />);

			const submitButton = screen.getByTestId('form-submit');
			fireEvent.click(submitButton);

			await waitFor(() => {
				expect(handleSubmit).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe('mode detection', () => {
		it('should detect create mode with null ingredient', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.getByTestId('form-mode')).toHaveTextContent('create');
		});

		it('should detect create mode with undefined ingredient', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={undefined} />);

			expect(screen.getByTestId('form-mode')).toHaveTextContent('create');
		});

		it('should detect edit mode with ingredient provided', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />);

			expect(screen.getByTestId('form-mode')).toHaveTextContent('edit');
		});
	});

	describe('dialog structure', () => {
		it('should not show close button', () => {
			render(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.queryByRole('button', { name: /close/i })).toBeInTheDocument();
		});
	});

	describe('data transformations', () => {
		it('should transform ingredient data correctly for form', () => {
			const complexIngredient: Ingredient = {
				id: '2',
				name: 'Salmon',
				calories: 206,
				protein: 22,
				carbs: 0,
				fat: 12.5,
				servingSize: 85,
				unit: 'oz',
				category: 'Seafood',
				version: 3,
				createdAt: '2024-02-01T00:00:00Z',
				updatedAt: '2024-02-15T00:00:00Z',
			};

			render(
				<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={complexIngredient} />
			);

			const initialDataElement = screen.getByTestId('form-initial-data');
			const parsedData = JSON.parse(initialDataElement.textContent || '{}');

			// Should exclude id, version, createdAt, updatedAt
			expect(parsedData).not.toHaveProperty('id');
			expect(parsedData).not.toHaveProperty('version');
			expect(parsedData).not.toHaveProperty('createdAt');
			expect(parsedData).not.toHaveProperty('updatedAt');

			// Should include all form fields
			expect(parsedData).toEqual({
				name: 'Salmon',
				calories: 206,
				protein: 22,
				carbs: 0,
				fat: 12.5,
				servingSize: 85,
				unit: 'oz',
				category: 'Seafood',
			});
		});

		it('should memoize initialData to prevent form resets', () => {
			const { rerender } = render(
				<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />
			);

			const firstData = screen.getByTestId('form-initial-data').textContent;

			// Rerender with same ingredient
			rerender(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />);

			const secondData = screen.getByTestId('form-initial-data').textContent;

			// Data should be identical (memoized)
			expect(firstData).toBe(secondData);
		});
	});

	describe('edge cases', () => {
		it('should handle ingredient with empty category', () => {
			const ingredientWithEmptyCategory: Ingredient = {
				...mockIngredient,
				category: '',
			};

			render(
				<IngredientDialog
					open={true}
					onClose={vi.fn()}
					onSubmit={vi.fn()}
					ingredient={ingredientWithEmptyCategory}
				/>
			);

			const initialDataElement = screen.getByTestId('form-initial-data');
			const parsedData = JSON.parse(initialDataElement.textContent || '{}');

			expect(parsedData.category).toBe('');
		});

		it('should handle ingredient with zero values', () => {
			const ingredientWithZeros: Ingredient = {
				...mockIngredient,
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
			};

			render(
				<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={ingredientWithZeros} />
			);

			const initialDataElement = screen.getByTestId('form-initial-data');
			const parsedData = JSON.parse(initialDataElement.textContent || '{}');

			expect(parsedData.calories).toBe(0);
			expect(parsedData.protein).toBe(0);
			expect(parsedData.carbs).toBe(0);
			expect(parsedData.fat).toBe(0);
		});

		it('should handle rapid open/close cycles', () => {
			const handleClose = vi.fn();
			const { rerender } = render(
				<IngredientDialog open={true} onClose={handleClose} onSubmit={vi.fn()} ingredient={null} />
			);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();

			rerender(<IngredientDialog open={false} onClose={handleClose} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.queryByText('New Ingredient')).not.toBeInTheDocument();

			rerender(<IngredientDialog open={true} onClose={handleClose} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();
		});

		it('should handle switching between create and edit modes', () => {
			const { rerender } = render(
				<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />
			);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();

			rerender(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={mockIngredient} />);

			expect(screen.getByText('Edit Ingredient')).toBeInTheDocument();

			rerender(<IngredientDialog open={true} onClose={vi.fn()} onSubmit={vi.fn()} ingredient={null} />);

			expect(screen.getByText('New Ingredient')).toBeInTheDocument();
		});
	});
});
