/**
 * ===========================================================================================
 * INGREDIENT TABLE2 TESTS
 * ===========================================================================================
 *
 * Test suite for IngredientTable2 component.
 * Tests ingredient-specific functionality and integration with Table2.
 *
 * ===========================================================================================
 */
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { Ingredient } from '@shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IngredientTable2 } from './IngredientTable2';

// Mock ingredient data
const mockIngredients: Ingredient[] = [
	{
		id: '1',
		name: 'Chicken Breast',
		calories: 165,
		protein: 31,
		carbs: 0,
		fat: 3.6,
		servingSize: 100,
		unit: 'g',
		category: 'Protein',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		version: 1,
	},
	{
		id: '2',
		name: 'Brown Rice',
		calories: 111,
		protein: 2.6,
		carbs: 23,
		fat: 0.9,
		servingSize: 100,
		unit: 'g',
		category: 'Grain',
		createdAt: '2024-01-02T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
		version: 1,
	},
	{
		id: '3',
		name: 'Broccoli',
		calories: 34,
		protein: 2.8,
		carbs: 7,
		fat: 0.4,
		servingSize: 100,
		unit: 'g',
		category: 'Vegetable',
		createdAt: '2024-01-03T00:00:00Z',
		updatedAt: '2024-01-03T00:00:00Z',
		version: 1,
	},
];

// Helper to create base props (matching QueryResultDisplayerProps)
const createBaseProps = (
	overrides?: Partial<QueryResultDisplayerProps<Ingredient>>
): QueryResultDisplayerProps<Ingredient> => ({
	data: mockIngredients,
	isLoading: false,
	error: null,
	...overrides,
});

describe('IngredientTable2', () => {
	describe('Basic Rendering', () => {
		it('renders ingredient table with data', () => {
			const props = createBaseProps();

			render(<IngredientTable2 {...props} />);

			// Check column headers
			expect(screen.getByText('Name')).toBeInTheDocument();
			expect(screen.getByText('Calories')).toBeInTheDocument();
			expect(screen.getByText('Protein')).toBeInTheDocument();
			expect(screen.getByText('Carbs')).toBeInTheDocument();
			expect(screen.getByText('Fat')).toBeInTheDocument();
			expect(screen.getByText('Category')).toBeInTheDocument();

			// Check ingredient data
			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
			expect(screen.getByText('Brown Rice')).toBeInTheDocument();
			expect(screen.getByText('Broccoli')).toBeInTheDocument();
		});

		it('renders nutritional values with correct formatting', () => {
			const props = createBaseProps();

			render(<IngredientTable2 {...props} />);

			// Check numeric formatting (with suffixes)
			expect(screen.getByText('165')).toBeInTheDocument(); // Calories
			expect(screen.getByText(/31g/)).toBeInTheDocument(); // Protein
			expect(screen.getByText(/23g/)).toBeInTheDocument(); // Carbs
			expect(screen.getByText(/3.6g/)).toBeInTheDocument(); // Fat
		});

		it('renders categories', () => {
			const props = createBaseProps();

			render(<IngredientTable2 {...props} />);

			expect(screen.getByText('Protein')).toBeInTheDocument();
			expect(screen.getByText('Grain')).toBeInTheDocument();
			expect(screen.getByText('Vegetable')).toBeInTheDocument();
		});

		it('renders metadata columns (id, createdAt, updatedAt)', () => {
			const props = createBaseProps();

			render(<IngredientTable2 {...props} />);

			// Check metadata headers
			expect(screen.getByText('ID')).toBeInTheDocument();
			expect(screen.getByText('Created')).toBeInTheDocument();
			expect(screen.getByText('Updated')).toBeInTheDocument();

			// Check IDs are rendered
			expect(screen.getByText('1')).toBeInTheDocument();
			expect(screen.getByText('2')).toBeInTheDocument();
			expect(screen.getByText('3')).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('shows custom empty message when no ingredients', () => {
			const props = createBaseProps({ data: [] });

			render(<IngredientTable2 {...props} />);

			expect(
				screen.getByText('No ingredients found. Add your first ingredient to get started.')
			).toBeInTheDocument();
		});
	});

	describe('Loading State', () => {
		it('shows loading state', () => {
			const props = createBaseProps({ isLoading: true, data: [] });

			render(<IngredientTable2 {...props} />);

			expect(screen.getByText('Loading...')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('displays error message', () => {
			const props = createBaseProps({ error: 'Failed to load ingredients' });

			render(<IngredientTable2 {...props} />);

			expect(screen.getByText(/Failed to load ingredients/)).toBeInTheDocument();
		});
	});

	describe('Actions', () => {
		it('renders edit and delete buttons when both callbacks provided', () => {
			const onEdit = vi.fn();
			const onDelete = vi.fn();
			const props = createBaseProps();

			render(<IngredientTable2 {...props} onEdit={onEdit} onDelete={onDelete} />);

			// Should have Actions column
			expect(screen.getByText('Actions')).toBeInTheDocument();

			// Should have edit and delete buttons for each row
			const editButtons = screen.getAllByLabelText(/Edit/);
			const deleteButtons = screen.getAllByLabelText(/Delete/);

			expect(editButtons).toHaveLength(3);
			expect(deleteButtons).toHaveLength(3);
		});

		it('renders only edit button when only onEdit provided', () => {
			const onEdit = vi.fn();
			const props = createBaseProps();

			render(<IngredientTable2 {...props} onEdit={onEdit} />);

			const editButtons = screen.getAllByLabelText(/Edit/);
			expect(editButtons).toHaveLength(3);

			// No delete buttons
			expect(screen.queryByLabelText(/Delete/)).not.toBeInTheDocument();
		});

		it('renders only delete button when only onDelete provided', () => {
			const onDelete = vi.fn();
			const props = createBaseProps();

			render(<IngredientTable2 {...props} onDelete={onDelete} />);

			const deleteButtons = screen.getAllByLabelText(/Delete/);
			expect(deleteButtons).toHaveLength(3);

			// No edit buttons
			expect(screen.queryByLabelText(/Edit/)).not.toBeInTheDocument();
		});

		it('does not render actions column when no callbacks provided', () => {
			const props = createBaseProps();

			render(<IngredientTable2 {...props} />);

			// No Actions column
			expect(screen.queryByText('Actions')).not.toBeInTheDocument();
		});

		it('calls onEdit with correct ingredient when edit clicked', async () => {
			const onEdit = vi.fn();
			const props = createBaseProps();

			render(<IngredientTable2 {...props} onEdit={onEdit} />);

			// Click edit button for first ingredient
			const editButtons = screen.getAllByLabelText(/Edit/);
			await userEvent.click(editButtons[0]);

			expect(onEdit).toHaveBeenCalledTimes(1);
			expect(onEdit).toHaveBeenCalledWith(mockIngredients[0]);
		});

		it('calls onDelete with correct id when delete clicked', async () => {
			const onDelete = vi.fn();
			const props = createBaseProps();

			render(<IngredientTable2 {...props} onDelete={onDelete} />);

			// Click delete button for second ingredient
			const deleteButtons = screen.getAllByLabelText(/Delete/);
			await userEvent.click(deleteButtons[1]);

			expect(onDelete).toHaveBeenCalledTimes(1);
			expect(onDelete).toHaveBeenCalledWith('2');
		});
	});

	describe('Pagination Integration', () => {
		it('renders pagination when pagination prop provided', () => {
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 3,
					totalItems: 30,
					pageSize: 10,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
				},
			});

			render(<IngredientTable2 {...props} />);

			expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
		});

		it('passes pagination callbacks through', async () => {
			const onPageChange = vi.fn();
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 3,
					totalItems: 30,
					pageSize: 10,
					onPageChange,
					onPageSizeChange: vi.fn(),
				},
			});

			render(<IngredientTable2 {...props} />);

			// Click next page
			const nextButton = screen.getByLabelText('Go to next page');
			await userEvent.click(nextButton);

			expect(onPageChange).toHaveBeenCalledWith(2);
		});
	});

	describe('Sorting Integration', () => {
		it('renders sortable headers when sorting prop provided', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'name', direction: 'asc' }],
					onSortChange: vi.fn(),
				},
			});

			render(<IngredientTable2 {...props} />);

			// Name should be sortable button
			const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
			expect(nameHeader).toBeInTheDocument();
		});

		it('passes sort callbacks through', async () => {
			const onSortChange = vi.fn();
			const props = createBaseProps({
				sorting: {
					sortConfigs: [],
					onSortChange,
				},
			});

			render(<IngredientTable2 {...props} />);

			// Click name column to sort
			const nameHeader = screen.getByRole('button', { name: /Sort by Name/ });
			await userEvent.click(nameHeader);

			expect(onSortChange).toHaveBeenCalledWith('name', false);
		});
	});

	describe('Custom Props Override', () => {
		it('allows overriding default props', () => {
			const props = createBaseProps({ data: [] });

			render(<IngredientTable2 {...props} emptyMessage="Custom empty message" striped={false} rowHeight={60} />);

			expect(screen.getByText('Custom empty message')).toBeInTheDocument();
		});
	});
});
