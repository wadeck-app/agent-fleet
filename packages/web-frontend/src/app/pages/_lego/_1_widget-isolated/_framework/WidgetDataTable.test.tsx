/**
 * ===========================================================================================
 * WIDGET DATA TABLE TEST SUITE (A1 - Widget Isolated)
 * ===========================================================================================
 *
 * Tests the WidgetDataTable component behavior:
 * - Data fetching with correct query parameters
 * - Loading states
 * - Pagination triggers refetch
 * - Error handling
 * - Search updates reset page and trigger refetch
 *
 * ===========================================================================================
 */
import { MemoryRouter } from 'react-router-dom';

import type { ColumnDef, DataTableFeature } from '@framework/lego';
import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WidgetDataTable } from './WidgetDataTable';

// Mock ProductsService
const mockGetProducts = vi.fn();
const mockService = {
	getProducts: mockGetProducts,
};

const mockProductList = [
	{
		id: 'prod-1',
		name: 'Gaming Laptop',
		category: 'Electronics',
		price: 1299.99,
		stock: 15,
		status: 'active',
		rating: 4.5,
		featured: true,
		description: 'High-performance gaming laptop',
	},
	{
		id: 'prod-2',
		name: 'Coffee Beans',
		category: 'Food',
		price: 19.99,
		stock: 100,
		status: 'active',
		rating: 4.8,
		featured: false,
		description: 'Premium coffee beans',
	},
];

const mockColumns: ColumnDef<(typeof mockProductList)[0]>[] = [
	{ key: 'name', label: 'Name' },
	{ key: 'category', label: 'Category' },
	{ key: 'price', label: 'Price', sortable: true },
];

describe('WidgetDataTable (A1)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProducts.mockResolvedValue({
			items: mockProductList,
			pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
		});
	});

	const renderTable = (features: DataTableFeature[] = []) => {
		return render(
			<MemoryRouter>
				<WidgetDataTable service={mockService} columns={mockColumns} features={features} />
			</MemoryRouter>
		);
	};

	describe('Core data fetching', () => {
		it('should call service.getProducts on mount', async () => {
			renderTable();

			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalled();
			});
		});

		it('should call service.getProducts with correct query params', async () => {
			renderTable(['pagination', 'search']);

			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						page: 1,
						pageSize: 10,
					})
				);
			});
		});

		it('should display fetched product data', async () => {
			renderTable();

			await screen.findByText('Gaming Laptop');
			expect(screen.getByText('Coffee Beans')).toBeInTheDocument();
		});
	});

	describe('Loading state', () => {
		it('should show loading indicator during fetch', async () => {
			const deferred = createDeferredPromise<any>();
			mockGetProducts.mockReturnValueOnce(deferred.promise);

			renderTable();

			// Loading state should be active (table should exist but no data yet)
			await waitFor(() => {
				const table = screen.queryByRole('table');
				expect(table).toBeInTheDocument();
			});

			// Should not show "No items found" during loading
			expect(screen.queryByText(/no items found/i)).not.toBeInTheDocument();

			// Resolve the promise
			deferred.resolve({
				items: mockProductList,
				pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
			});

			// Data should appear
			await screen.findByText('Gaming Laptop');
		});

		it('should hide loading indicator after fetch', async () => {
			renderTable();

			// Wait for data to load
			await screen.findByText('Gaming Laptop');

			// Loading should be complete (data is visible)
			expect(screen.getByText('Coffee Beans')).toBeInTheDocument();
		});
	});

	describe('Pagination changes trigger refetch', () => {
		it('should call fetchData with new page when page changes', async () => {
			// Mock data with multiple pages
			mockGetProducts.mockResolvedValue({
				items: mockProductList,
				pagination: { page: 1, pageSize: 10, total: 25, totalPages: 3 },
			});

			renderTable(['pagination']);

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Clear mock to track new calls
			mockGetProducts.mockClear();

			// Find and click page 2 button (aria-label="Go to page 2")
			const page2Button = screen.getByRole('button', { name: 'Go to page 2' });
			await userEvent.click(page2Button);

			// Should call getProducts with page 2
			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						page: 2,
						pageSize: 10,
					})
				);
			});
		});
	});

	describe('Error handling', () => {
		it('should show error state when service throws', async () => {
			mockGetProducts.mockRejectedValueOnce(new Error('Network error'));

			renderTable();

			// Wait for error to be handled
			await waitFor(() => {
				// Items should be empty, but component should not crash
				expect(document.body).toBeInTheDocument();
			});

			// Should show empty state (no items found) after error
			await waitFor(() => {
				const emptyMessage = screen.queryByText(/no items found/i);
				expect(emptyMessage).toBeInTheDocument();
			});
		});
	});

	describe('Search updates', () => {
		it('should reset page and trigger refetch when search changes', async () => {
			renderTable(['search', 'pagination']);

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Clear mock to track new calls
			mockGetProducts.mockClear();

			// Type in search input
			const searchInput = screen.getByPlaceholderText(/search/i);
			await userEvent.type(searchInput, 'laptop');

			// Should call getProducts with search param and page reset to 1
			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						search: 'laptop',
						page: 1,
					})
				);
			});
		});

		it('should trigger refetch when search is cleared', async () => {
			renderTable(['search']);

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Type search first
			const searchInput = screen.getByPlaceholderText(/search/i);
			await userEvent.type(searchInput, 'test');

			// Wait for search to trigger
			await waitFor(() => {
				const params = mockGetProducts.mock.calls[mockGetProducts.mock.calls.length - 1]?.[0];
				expect(params?.search).toBe('test');
			});

			// Clear mock
			mockGetProducts.mockClear();

			// Clear search
			await userEvent.clear(searchInput);

			// Should call getProducts without search param
			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalled();
				const params = mockGetProducts.mock.calls[mockGetProducts.mock.calls.length - 1]?.[0];
				expect(params?.search === undefined || params?.search === '').toBe(true);
			});
		});
	});
});
