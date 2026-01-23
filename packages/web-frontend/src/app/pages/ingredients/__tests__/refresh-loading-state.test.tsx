/**
 * Test to verify that refresh shows loading state (blur) in BOTH v2 and v5
 * This test should PASS for v2 and FAIL for v5 (exposing the bug)
 */
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ToastProvider } from '@framework/features/toast/ToastContext';
import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import type { IngredientListResponse } from '@shared/api/ingredients.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ingredients2TablePage } from '@app/pages/ingredients2/Ingredients2TablePage';
import { IngredientsV5Page } from '@app/pages/ingredients5/IngredientsV5Page';

import { mockIngredients } from './ingredientMocks';

// Hoisted mocks
const {
	mockGetIngredients,
	mockGetIngredient,
	mockCreateIngredient,
	mockUpdateIngredient,
	mockDeleteIngredient,
	mockBulkDeleteIngredients,
	mockCalculateTotalMacros,
} = vi.hoisted(() => ({
	mockGetIngredients: vi.fn(),
	mockGetIngredient: vi.fn(),
	mockCreateIngredient: vi.fn(),
	mockUpdateIngredient: vi.fn(),
	mockDeleteIngredient: vi.fn(),
	mockBulkDeleteIngredients: vi.fn(),
	mockCalculateTotalMacros: vi.fn(),
}));

vi.mock('@app/pages/ingredients/IngredientsService', () => ({
	ingredientsService: {
		getIngredients: mockGetIngredients,
		getIngredient: mockGetIngredient,
		createIngredient: mockCreateIngredient,
		updateIngredient: mockUpdateIngredient,
		deleteIngredient: mockDeleteIngredient,
		bulkDeleteIngredients: mockBulkDeleteIngredients,
		calculateTotalMacros: mockCalculateTotalMacros,
	},
}));

const mocks = {
	getIngredients: mockGetIngredients,
	calculateTotalMacros: mockCalculateTotalMacros,
};

describe.each([
	{ version: 'v2' as const, Component: Ingredients2TablePage, path: '/ingredients2' },
	{ version: 'v5' as const, Component: IngredientsV5Page, path: '/ingredients5' },
])('$version - Refresh Loading State', ({ version, Component, path }) => {
	const renderPage = () => {
		return render(
			<ToastProvider>
				<MemoryRouter initialEntries={[path]}>
					<Routes>
						<Route path={path} element={<Component />} />
					</Routes>
				</MemoryRouter>
			</ToastProvider>
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock calculateTotalMacros
		mocks.calculateTotalMacros.mockReturnValue({
			totalCalories: 0,
			totalProtein: 0,
			totalCarbs: 0,
			totalFat: 0,
		});
	});

	it('should show loading state (refreshing/blur) when clicking refresh button', async () => {
		const user = userEvent.setup();

		// Use deferred promise to control when API resolves
		const { promise: initialPromise, resolve: resolveInitial } = createDeferredPromise<IngredientListResponse>();
		mocks.getIngredients.mockReturnValueOnce(initialPromise);

		renderPage();

		// Resolve initial load
		resolveInitial({
			items: [mockIngredients.chickenBreast, mockIngredients.brownRice],
			pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
		});

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
		});

		// Setup deferred promise for refresh call
		const { promise: refreshPromise, resolve: resolveRefresh } = createDeferredPromise<IngredientListResponse>();
		mocks.getIngredients.mockReturnValueOnce(refreshPromise);

		// Click refresh button
		const refreshButton = screen.getByLabelText('Refresh');
		await user.click(refreshButton);

		// CRITICAL: Verify refreshing/loading state is shown (blur effect)
		// This is the bug in v5 - it doesn't show loading state because
		// useTableRefreshing only tracks param changes, not manual refresh
		await waitFor(() => {
			// TableBody applies blur effect to tbody when refreshing
			// See: framework/components/table/TableBody.tsx lines 102-105
			const tbody = document.querySelector('tbody');
			expect(tbody).toBeInTheDocument();

			// Check if tbody has the refreshing blur classes
			// v2 should have these during refresh (via Data2's isLoading)
			// v5 should NOT have these (bug: useTableRefreshing doesn't detect manual refresh)
			const hasBlur = tbody?.classList.contains('blur-sm');
			const hasOpacity = tbody?.classList.contains('opacity-50');
			const hasLoadingState = hasBlur && hasOpacity;

			console.log(`[TEST] Has blur-sm: ${hasBlur}, has opacity-50: ${hasOpacity}`);

			expect(hasLoadingState).toBe(true);
		});

		// Resolve the refresh
		resolveRefresh({
			items: [mockIngredients.chickenBreast, mockIngredients.brownRice],
			pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
		});

		// Wait for loading state to clear
		await waitFor(() => {
			const tbody = document.querySelector('tbody');
			const hasBlur = tbody?.classList.contains('blur-sm');
			const hasOpacity = tbody?.classList.contains('opacity-50');

			console.log(`[TEST] After refresh - Has blur-sm: ${hasBlur}, has opacity-50: ${hasOpacity}`);

			expect(hasBlur).toBe(false);
			expect(hasOpacity).toBe(false);
		});
	});
});
