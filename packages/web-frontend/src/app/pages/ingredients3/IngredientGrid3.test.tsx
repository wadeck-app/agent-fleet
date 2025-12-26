/**
 * ===========================================================================================
 * INGREDIENT GRID3 TESTS
 * ===========================================================================================
 *
 * Comprehensive test suite for IngredientGrid3 component.
 * Tests cover all features: data display, sorting, pagination, loading, error states.
 *
 * ===========================================================================================
 */
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IngredientGrid3 } from './IngredientGrid3';

// Sample test data
const mockIngredients: Ingredient[] = [
	{
		id: '1',
		version: 1,
		name: 'Chicken Breast',
		category: 'Protein',
		calories: 165,
		protein: 31,
		carbs: 0,
		fat: 3.6,
		servingSize: 100,
		unit: 'g',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	},
	{
		id: '2',
		version: 1,
		name: 'Brown Rice',
		category: 'Grains',
		calories: 215,
		protein: 5,
		carbs: 45,
		fat: 1.6,
		servingSize: 100,
		unit: 'g',
		createdAt: '2024-01-02T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
	},
	{
		id: '3',
		version: 1,
		name: 'Broccoli',
		category: 'Vegetables',
		calories: 55,
		protein: 3.7,
		carbs: 11,
		fat: 0.6,
		servingSize: 100,
		unit: 'g',
		createdAt: '2024-01-03T00:00:00Z',
		updatedAt: '2024-01-03T00:00:00Z',
	},
];

// Helper to create base props
const createBaseProps = (
	overrides?: Partial<QueryResultDisplayerProps<Ingredient>>
): Partial<QueryResultDisplayerProps<Ingredient>> => ({
	data: mockIngredients,
	isLoading: false,
	error: null,
	...overrides,
});

describe('IngredientGrid3', () => {
	describe('Basic Rendering', () => {
		it('renders grid with data', () => {
			const props = createBaseProps();

			render(<IngredientGrid3 {...props} />);

			// Check ingredient names are displayed
			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
			expect(screen.getByText('Brown Rice')).toBeInTheDocument();
			expect(screen.getByText('Broccoli')).toBeInTheDocument();
		});

		it('renders ingredient details', () => {
			const props = createBaseProps();

			render(<IngredientGrid3 {...props} />);

			// Check that nutritional info is displayed
			expect(screen.getByText('Protein')).toBeInTheDocument();
			expect(screen.getByText('Grains')).toBeInTheDocument();
			expect(screen.getByText('Vegetables')).toBeInTheDocument();
		});

		it('applies responsive grid classes', () => {
			const props = createBaseProps();

			const { container } = render(<IngredientGrid3 {...props} />);

			// Check for responsive grid classes
			const grid = container.querySelector('.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3');
			expect(grid).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('renders empty state when no data', () => {
			const props = createBaseProps({ data: [] });

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText('No ingredients found')).toBeInTheDocument();
			expect(screen.getByText('Add your first ingredient to get started')).toBeInTheDocument();
		});

		it('shows search query in empty state', () => {
			const props = createBaseProps({
				data: [],
				features: {
					search: {
						query: 'chicken',
						isEmpty: false,
					},
				},
			});

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText(/No results for "chicken"/)).toBeInTheDocument();
		});
	});

	describe('Loading State', () => {
		it('shows loading skeleton cards', () => {
			const props = createBaseProps({ isLoading: true, data: [] });

			const { container } = render(<IngredientGrid3 {...props} />);

			// Check for skeleton cards with animate-pulse
			const skeletons = container.querySelectorAll('.animate-pulse');
			expect(skeletons.length).toBeGreaterThan(0);
		});

		it('does not show data when loading initially', () => {
			const props = createBaseProps({ isLoading: true, data: [] });

			render(<IngredientGrid3 {...props} />);

			expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
		});

		it('respects pageSize for skeleton count', () => {
			const props = createBaseProps({
				isLoading: true,
				data: [],
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: 0,
					pageSize: 6,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
				},
			});

			const { container } = render(<IngredientGrid3 {...props} />);

			// Should render 6 skeleton cards
			const skeletons = container.querySelectorAll('.animate-pulse');
			expect(skeletons).toHaveLength(6);
		});
	});

	describe('Error State', () => {
		it('displays error message', () => {
			const props = createBaseProps({ error: 'Failed to fetch ingredients', isLoading: false });

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText(/Failed to fetch ingredients/)).toBeInTheDocument();
		});

		it('does not show error when loading', () => {
			const props = createBaseProps({ error: 'Some error', isLoading: true });

			render(<IngredientGrid3 {...props} />);

			// Error should not be shown when loading
			expect(screen.queryByText(/Some error/)).not.toBeInTheDocument();
		});
	});

	describe('Sorting', () => {
		it('renders sort controls when sorting prop provided', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'name', direction: 'asc' }],
					onSortChange: vi.fn(),
				},
			});

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText('Sort by:')).toBeInTheDocument();
			expect(screen.getByRole('combobox')).toBeInTheDocument();
		});

		it('does not render sort controls when sorting prop absent', () => {
			const props = createBaseProps();

			render(<IngredientGrid3 {...props} />);

			expect(screen.queryByText('Sort by:')).not.toBeInTheDocument();
		});

		it('shows sort indicator bar when sorting is active', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'calories', direction: 'desc' }],
					onSortChange: vi.fn(),
				},
			});

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText('Sorted by:')).toBeInTheDocument();
			expect(screen.getByText('calories')).toBeInTheDocument();
		});

		it('shows sort direction in indicator', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'name', direction: 'asc' }],
					onSortChange: vi.fn(),
				},
			});

			const { container } = render(<IngredientGrid3 {...props} />);

			// Check for arrow up icon (ascending)
			const arrowUp = container.querySelector('svg.lucide-arrow-up');
			expect(arrowUp).toBeInTheDocument();
		});

		it('calls onSortChange when sort field changed', async () => {
			const onSortChange = vi.fn();
			const props = createBaseProps({
				sorting: {
					sortConfigs: [],
					onSortChange,
				},
			});

			render(<IngredientGrid3 {...props} />);

			// Find and open sort selector
			const sortSelect = screen.getByRole('combobox');
			await userEvent.click(sortSelect);

			// Select calories
			const caloriesOption = screen.getByRole('option', { name: 'Calories' });
			await userEvent.click(caloriesOption);

			expect(onSortChange).toHaveBeenCalledWith('calories', false);
		});

		it('toggles sort direction when direction button clicked', async () => {
			const onSortChange = vi.fn();
			const props = createBaseProps({
				sorting: {
					sortConfigs: [{ key: 'name', direction: 'asc' }],
					onSortChange,
				},
			});

			const { container } = render(<IngredientGrid3 {...props} />);

			// Find direction toggle button (should have arrow icon)
			const directionButton = container.querySelector('button[title*="Sort direction"]');
			expect(directionButton).toBeInTheDocument();

			if (directionButton) {
				await userEvent.click(directionButton);
				expect(onSortChange).toHaveBeenCalledWith('name', false);
			}
		});

		it('shows multi-sort priority badges', () => {
			const props = createBaseProps({
				sorting: {
					sortConfigs: [
						{ key: 'calories', direction: 'desc' },
						{ key: 'protein', direction: 'asc' },
					],
					onSortChange: vi.fn(),
				},
			});

			const { container } = render(<IngredientGrid3 {...props} />);

			// Check for priority badges
			const badges = container.querySelectorAll('.rounded-full.bg-primary\\/20');
			expect(badges).toHaveLength(2);
		});
	});

	describe('Pagination', () => {
		it('renders pagination controls when pagination prop provided', () => {
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 5,
					totalItems: 45,
					pageSize: 9,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
					pageSizeOptions: [6, 9, 12, 24],
				},
			});

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText('Showing 1 to 3 of 45 items')).toBeInTheDocument();
			expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
		});

		it('does not render pagination when pagination prop absent', () => {
			const props = createBaseProps();

			render(<IngredientGrid3 {...props} />);

			expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
		});

		it('calls onPageChange when page changed', async () => {
			const onPageChange = vi.fn();
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 5,
					totalItems: 45,
					pageSize: 9,
					onPageChange,
					onPageSizeChange: vi.fn(),
				},
			});

			render(<IngredientGrid3 {...props} />);

			// Click next page button
			const nextButton = screen.getByLabelText('Go to next page');
			await userEvent.click(nextButton);

			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it('uses grid-friendly page sizes', () => {
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: 9,
					pageSize: 9,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
					pageSizeOptions: [6, 9, 12, 24],
				},
			});

			render(<IngredientGrid3 {...props} />);

			// Check that grid-friendly sizes are available
			expect(screen.getByText('9')).toBeInTheDocument(); // Current page size display
		});
	});

	describe('Actions', () => {
		it('renders edit and delete buttons when callbacks provided', () => {
			const props = createBaseProps();
			const onEdit = vi.fn();
			const onDelete = vi.fn();

			render(<IngredientGrid3 {...props} onEdit={onEdit} onDelete={onDelete} />);

			// Should have Edit and Delete buttons for each ingredient
			const editButtons = screen.getAllByText('Edit');
			const deleteButtons = screen.getAllByText('Delete');

			expect(editButtons).toHaveLength(3);
			expect(deleteButtons).toHaveLength(3);
		});

		it('does not render actions when callbacks absent', () => {
			const props = createBaseProps();

			render(<IngredientGrid3 {...props} />);

			// Should not have Edit or Delete buttons
			expect(screen.queryByText('Edit')).not.toBeInTheDocument();
			expect(screen.queryByText('Delete')).not.toBeInTheDocument();
		});

		it('calls onEdit with correct ingredient', async () => {
			const props = createBaseProps();
			const onEdit = vi.fn();

			render(<IngredientGrid3 {...props} onEdit={onEdit} />);

			// Click first Edit button
			const editButtons = screen.getAllByText('Edit');
			await userEvent.click(editButtons[0]);

			expect(onEdit).toHaveBeenCalledWith(mockIngredients[0]);
		});

		it('calls onDelete with correct id', async () => {
			const props = createBaseProps();
			const onDelete = vi.fn();

			render(<IngredientGrid3 {...props} onDelete={onDelete} />);

			// Click first Delete button
			const deleteButtons = screen.getAllByText('Delete');
			await userEvent.click(deleteButtons[0]);

			expect(onDelete).toHaveBeenCalledWith('1');
		});
	});

	describe('Refreshing State', () => {
		it('applies blur effect when refreshing', () => {
			const props = createBaseProps({ refreshing: true });

			const { container } = render(<IngredientGrid3 {...props} />);

			// Check for opacity-50 and pointer-events-none classes
			const grid = container.querySelector('.pointer-events-none.opacity-50');
			expect(grid).toBeInTheDocument();
		});

		it('shows spinner overlay when refreshing', () => {
			const props = createBaseProps({ refreshing: true });

			const { container } = render(<IngredientGrid3 {...props} />);

			// Check for spinner with animate-spin
			const spinner = container.querySelector('.animate-spin');
			expect(spinner).toBeInTheDocument();
		});

		it('does not show refreshing overlay when not refreshing', () => {
			const props = createBaseProps({ refreshing: false });

			const { container } = render(<IngredientGrid3 {...props} />);

			// Should not have blur effect
			const grid = container.querySelector('.pointer-events-none.opacity-50');
			expect(grid).not.toBeInTheDocument();
		});
	});

	describe('Edge Cases', () => {
		it('handles single ingredient', () => {
			const props = createBaseProps({ data: [mockIngredients[0]] });

			render(<IngredientGrid3 {...props} />);

			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
			expect(screen.queryByText('Brown Rice')).not.toBeInTheDocument();
		});

		it('handles large dataset', () => {
			const largeData: Ingredient[] = Array.from({ length: 24 }, (_, i) => ({
				id: `${i}`,
				version: 1,
				name: `Ingredient ${i}`,
				category: 'Test',
				calories: 100 + i,
				protein: 10 + i,
				carbs: 20 + i,
				fat: 5 + i,
				servingSize: 100,
				unit: 'g',
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			}));

			const props = createBaseProps({ data: largeData });

			render(<IngredientGrid3 {...props} />);

			// Should render all ingredients
			expect(screen.getByText('Ingredient 0')).toBeInTheDocument();
			expect(screen.getByText('Ingredient 23')).toBeInTheDocument();
		});

		it('handles missing optional pagination options', () => {
			const props = createBaseProps({
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: 9,
					pageSize: 9,
					onPageChange: vi.fn(),
					onPageSizeChange: vi.fn(),
					// pageSizeOptions not provided - should use default [6, 9, 12, 24]
				},
			});

			// Should not throw
			expect(() => {
				render(<IngredientGrid3 {...props} />);
			}).not.toThrow();
		});
	});
});
