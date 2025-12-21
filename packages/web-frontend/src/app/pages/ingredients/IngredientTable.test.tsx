import { withMetadata } from '@framework/tests/withMetadata';
import type { Ingredient } from '@shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IngredientTable } from './IngredientTable';

describe('IngredientTable', () => {
	const mockIngredients: Ingredient[] = [
		withMetadata({
			id: '1',
			name: 'Chicken Breast',
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			servingSize: 100,
			unit: 'g',
			category: 'Protein',
		}),
		withMetadata({
			id: '2',
			name: 'Brown Rice',
			calories: 123,
			protein: 2.6,
			carbs: 25.6,
			fat: 0.9,
			servingSize: 100,
			unit: 'g',
			category: 'Grains',
		}),
	];

	const defaultProps = {
		storageId: 'test-storage',
		ingredients: mockIngredients,
		onDelete: vi.fn<(id: string) => void>(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render table headers', () => {
			const { container } = render(<IngredientTable {...defaultProps} />);

			// Query headers specifically from the thead section
			const thead = container.querySelector('thead');
			expect(thead).toBeInTheDocument();

			expect(thead?.textContent).toContain('Name');
			expect(thead?.textContent).toContain('Calories');
			expect(thead?.textContent).toContain('Protein');
			expect(thead?.textContent).toContain('Carbs');
			expect(thead?.textContent).toContain('Fat');
			expect(thead?.textContent).toContain('Category');
			expect(thead?.textContent).toContain('Actions');
		});

		it('should render all ingredients', () => {
			render(<IngredientTable {...defaultProps} />);

			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
			expect(screen.getByText('Brown Rice')).toBeInTheDocument();
		});

		it('should render ingredient details correctly', () => {
			const { container } = render(<IngredientTable {...defaultProps} />);

			// Check first ingredient
			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
			expect(screen.getByText('165')).toBeInTheDocument();
			expect(screen.getByText('31g')).toBeInTheDocument();
			expect(screen.getByText('0g')).toBeInTheDocument();
			expect(screen.getByText('3.6g')).toBeInTheDocument();

			// Check for "Protein" category in tbody (not thead)
			const tbody = container.querySelector('tbody');
			expect(tbody?.textContent).toContain('Protein');

			// Check second ingredient
			expect(screen.getByText('Brown Rice')).toBeInTheDocument();
			expect(screen.getByText('123')).toBeInTheDocument();
			expect(screen.getByText('2.6g')).toBeInTheDocument();
			expect(screen.getByText('25.6g')).toBeInTheDocument();
			expect(screen.getByText('0.9g')).toBeInTheDocument();
			expect(tbody?.textContent).toContain('Grains');
		});

		it('should render dash when category is missing', () => {
			const ingredientsWithoutCategory: Ingredient[] = [
				withMetadata({
					id: '1',
					name: 'Test Ingredient',
					calories: 100,
					protein: 10,
					carbs: 5,
					fat: 2,
					servingSize: 100,
					unit: 'g',
				}),
			];

			render(
				<IngredientTable storageId="test-storage" ingredients={ingredientsWithoutCategory} onDelete={vi.fn()} />
			);

			// Should render dash for missing category
			expect(screen.getByText('-')).toBeInTheDocument();
		});

		it('should render delete button for each ingredient', () => {
			render(<IngredientTable {...defaultProps} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete ingredient/i });
			expect(deleteButtons).toHaveLength(mockIngredients.length);
		});

		it('should render edit button when onEdit is provided', () => {
			const onEdit = vi.fn<(ingredient: Ingredient) => void>();
			render(<IngredientTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit ingredient/i });
			expect(editButtons).toHaveLength(mockIngredients.length);
		});

		it('should not render edit button when onEdit is not provided', () => {
			render(<IngredientTable {...defaultProps} />);

			const editButtons = screen.queryAllByRole('button', { name: /edit ingredient/i });
			expect(editButtons).toHaveLength(0);
		});
	});

	describe('empty state', () => {
		it('should render table structure even with empty ingredients', () => {
			const { container } = render(
				<IngredientTable storageId="test-storage" ingredients={[]} onDelete={vi.fn()} />
			);

			// Query headers from thead
			const thead = container.querySelector('thead');
			expect(thead?.textContent).toContain('Name');
			expect(thead?.textContent).toContain('Calories');
		});
	});

	describe('delete action', () => {
		it('should show confirmation dialog when delete is clicked', async () => {
			const onDelete = vi.fn();
			render(<IngredientTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete ingredient/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Chicken Breast"\?/ })).toBeInTheDocument();
			});
		});

		it('should call onDelete when user confirms', async () => {
			const onDelete = vi.fn();

			render(<IngredientTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete ingredient/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Chicken Breast"\?/ })).toBeInTheDocument();
			});

			const confirmButton = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('1');
			});
		});

		it('should not call onDelete when user cancels', async () => {
			const onDelete = vi.fn();

			render(<IngredientTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete ingredient/i });
			fireEvent.click(deleteButtons[0]!);

			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Chicken Breast"\?/ })).toBeInTheDocument();
			});

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			fireEvent.click(cancelButton);

			await waitFor(() => {
				expect(screen.queryByRole('heading', { name: /Delete "Chicken Breast"\?/ })).not.toBeInTheDocument();
			});

			expect(onDelete).not.toHaveBeenCalled();
		});

		it('should call onDelete with correct ingredient id', async () => {
			const onDelete = vi.fn();

			render(<IngredientTable {...defaultProps} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByRole('button', { name: /delete ingredient/i });

			// Delete first ingredient
			fireEvent.click(deleteButtons[0]!);
			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Chicken Breast"\?/ })).toBeInTheDocument();
			});
			const confirmButton1 = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton1);
			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('1');
			});

			// Delete second ingredient
			fireEvent.click(deleteButtons[1]!);
			await waitFor(() => {
				expect(screen.getByRole('heading', { name: /Delete "Brown Rice"\?/ })).toBeInTheDocument();
			});
			const confirmButton2 = screen.getByRole('button', { name: /^delete$/i });
			fireEvent.click(confirmButton2);
			await waitFor(() => {
				expect(onDelete).toHaveBeenCalledWith('2');
			});
		});
	});

	describe('edit action', () => {
		it('should call onEdit with ingredient when edit is clicked', () => {
			const onEdit = vi.fn<(ingredient: Ingredient) => void>();
			render(<IngredientTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit ingredient/i });
			fireEvent.click(editButtons[0]!);

			expect(onEdit).toHaveBeenCalledWith(mockIngredients[0]);
		});

		it('should call onEdit with correct ingredient', () => {
			const onEdit = vi.fn<(ingredient: Ingredient) => void>();
			render(<IngredientTable {...defaultProps} onEdit={onEdit} />);

			const editButtons = screen.getAllByRole('button', { name: /edit ingredient/i });

			// Edit first ingredient
			fireEvent.click(editButtons[0]!);
			expect(onEdit).toHaveBeenCalledWith(mockIngredients[0]);

			// Edit second ingredient
			fireEvent.click(editButtons[1]!);
			expect(onEdit).toHaveBeenCalledWith(mockIngredients[1]);
		});
	});

	describe('table styling', () => {
		it('should apply alternating row styles', () => {
			const { container } = render(<IngredientTable {...defaultProps} />);

			const rows = container.querySelectorAll('tbody tr');
			expect(rows).toHaveLength(mockIngredients.length);

			// First row should have bg-background class
			expect(rows[0]!.className).toContain('bg-background');

			// Second row should have bg-muted/20 class
			expect(rows[1]!.className).toContain('bg-muted/20');
		});

		it('should have hover effect on rows', () => {
			const { container } = render(<IngredientTable {...defaultProps} />);

			const rows = container.querySelectorAll('tbody tr');

			rows.forEach(row => {
				expect(row.className).toContain('hover:bg-muted/50');
			});
		});
	});
});
