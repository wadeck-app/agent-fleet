import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ToastProvider } from '@framework/features/toast/ToastContext';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IngredientsV5Page } from './IngredientsV5Page';

// Hoisted mocks - must be created before vi.mock()
const {
	mockGetIngredients,
	mockCreateIngredient,
	mockUpdateIngredient,
	mockDeleteIngredient,
	mockBulkDeleteIngredients,
	mockCalculateTotalMacros,
} = vi.hoisted(() => ({
	mockGetIngredients: vi.fn(),
	mockCreateIngredient: vi.fn(),
	mockUpdateIngredient: vi.fn(),
	mockDeleteIngredient: vi.fn(),
	mockBulkDeleteIngredients: vi.fn(),
	mockCalculateTotalMacros: vi.fn(),
}));

vi.mock('@app/pages/ingredients/IngredientsService', () => ({
	ingredientsService: {
		getIngredients: mockGetIngredients,
		createIngredient: mockCreateIngredient,
		updateIngredient: mockUpdateIngredient,
		deleteIngredient: mockDeleteIngredient,
		bulkDeleteIngredients: mockBulkDeleteIngredients,
		calculateTotalMacros: mockCalculateTotalMacros,
	},
}));

describe('IngredientsV5Page - Refresh Behavior', () => {
	const mockIngredients = [
		{
			id: '1',
			name: 'Chicken Breast',
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			servingSize: 100,
			category: 'Protein',
			version: 1,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	];

	const renderPage = () => {
		return render(
			<ToastProvider>
				<MemoryRouter initialEntries={['/ingredients5']}>
					<Routes>
						<Route path="/ingredients5" element={<IngredientsV5Page />} />
					</Routes>
				</MemoryRouter>
			</ToastProvider>
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Default: return mock data
		mockGetIngredients.mockResolvedValue({
			items: mockIngredients,
			pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
		});

		// Mock calculateTotalMacros
		mockCalculateTotalMacros.mockReturnValue({
			totalCalories: 165,
			totalProtein: 31,
			totalCarbs: 0,
			totalFat: 3.6,
		});
	});

	it('should UPDATE TABLE with new data when clicking refresh button', async () => {
		const user = userEvent.setup();
		renderPage();

		// Wait for initial load to complete
		await waitFor(
			() => {
				expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
			},
			{ timeout: 3000 }
		);

		// Change mock to return DIFFERENT data
		const updatedIngredients = [
			{
				id: '1',
				name: 'UPDATED INGREDIENT NAME',
				calories: 200,
				protein: 35,
				carbs: 5,
				fat: 4.0,
				servingSize: 100,
				category: 'Protein',
				version: 2,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-02T00:00:00Z',
			},
		];

		mockGetIngredients.mockResolvedValue({
			items: updatedIngredients,
			pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
		});

		mockCalculateTotalMacros.mockReturnValue({
			totalCalories: 200,
			totalProtein: 35,
			totalCarbs: 5,
			totalFat: 4.0,
		});

		// Find and click refresh button
		const refreshButton = screen.getByLabelText('Refresh');
		await user.click(refreshButton);

		// REAL BEHAVIOR: Table should display the NEW data
		await waitFor(
			() => {
				// Old data should be gone
				expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
				// New data should appear
				expect(screen.getByText('UPDATED INGREDIENT NAME')).toBeInTheDocument();
			},
			{ timeout: 3000 }
		);
	});

	it('should maintain search/sort/page params when refreshing', async () => {
		const user = userEvent.setup();
		renderPage();

		// Wait for initial load
		await waitFor(() => {
			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
		});

		// Apply a sort by clicking column header
		const nameHeader = screen.getByText('Name');
		await user.click(nameHeader);

		// Wait for sort to trigger API call
		await waitFor(() => {
			expect(mockGetIngredients).toHaveBeenCalledTimes(2); // Initial + sort
		});

		// Capture the params used for sorted call
		const sortedCall = mockGetIngredients.mock.calls[1];
		const sortedParams = sortedCall?.[0];

		// Clear mock to isolate refresh call
		mockGetIngredients.mockClear();

		// Click refresh
		const refreshButton = screen.getByLabelText('Refresh');
		await user.click(refreshButton);

		// BEHAVIOR: API should be called with SAME params as before
		await waitFor(() => {
			expect(mockGetIngredients).toHaveBeenCalledTimes(1);
			const refreshCall = mockGetIngredients.mock.calls[0];
			const refreshParams = refreshCall?.[0];

			// Should preserve sortBy and sortOrder
			expect(refreshParams?.sortBy).toBe(sortedParams?.sortBy);
			expect(refreshParams?.sortOrder).toBe(sortedParams?.sortOrder);
		});
	});
});
