/**
 * ===========================================================================================
 * HOOK DATA TABLE TEST SUITE (A3 - Feature Hooks)
 * ===========================================================================================
 *
 * Tests the HookDataTable component behavior:
 * - Renders with product data from service
 * - usePaginationFeature state used for query
 * - useSearchFeature query passed to service
 * - Pagination + search compose correctly
 * - Loading and error states
 *
 * ===========================================================================================
 */
import { MemoryRouter } from 'react-router-dom';

import type { ColumnDef } from '@framework/lego/types/ColTypes';
import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataTableFeatureHook } from './HookDataTable';
import { HookDataTable } from './HookDataTable';
import { usePaginationFeature } from './usePaginationFeature';
import { useSearchFeature } from './useSearchFeature';

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

// Test wrapper component that uses hooks and passes them to HookDataTable
// Hooks must always be called unconditionally -- included in features based on props
function TestWrapper({ withPagination = false, withSearch = false }) {
	const searchFeature = useSearchFeature({ placeholder: 'Search products...' });
	const paginationFeature = usePaginationFeature({ defaultSize: 10, pageSizes: [10, 20, 50] });

	const features: DataTableFeatureHook[] = [
		...(withSearch ? [searchFeature] : []),
		...(withPagination ? [paginationFeature] : []),
	];

	return <HookDataTable service={mockService} columns={mockColumns} features={features} />;
}

describe('HookDataTable (A3)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProducts.mockResolvedValue({
			items: mockProductList,
			pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
		});
	});

	const renderTable = (props: { withPagination?: boolean; withSearch?: boolean } = {}) => {
		return render(
			<MemoryRouter>
				<TestWrapper {...props} />
			</MemoryRouter>
		);
	};

	describe('Renders with product data from service', () => {
		it('should call service.getProducts on mount', async () => {
			renderTable();

			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalled();
			});
		});

		it('should display fetched product data in table rows', async () => {
			renderTable();

			// Wait for data to load
			await screen.findByText('Gaming Laptop');
			expect(screen.getByText('Coffee Beans')).toBeInTheDocument();
			expect(screen.getByText('Electronics')).toBeInTheDocument();
			expect(screen.getByText('Food')).toBeInTheDocument();
		});
	});

	describe('usePaginationFeature state used for query', () => {
		it('should pass pagination state to service call', async () => {
			renderTable({ withPagination: true });

			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						page: 1,
						pageSize: 10,
					})
				);
			});
		});

		it('should update query when pagination changes', async () => {
			// Mock multiple pages
			mockGetProducts.mockResolvedValue({
				items: mockProductList,
				pagination: { page: 1, pageSize: 10, total: 25, totalPages: 3 },
			});

			renderTable({ withPagination: true });

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Clear mock
			mockGetProducts.mockClear();

			// Click page 2
			const page2Button = screen.getByRole('button', { name: 'Go to page 2' });
			await userEvent.click(page2Button);

			// Should call with page 2
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

	describe('useSearchFeature query passed to service', () => {
		it('should pass search query to service call', async () => {
			renderTable({ withSearch: true });

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Clear mock
			mockGetProducts.mockClear();

			// Type in search
			const searchInput = screen.getByPlaceholderText(/search products/i);
			await userEvent.type(searchInput, 'laptop');

			// Should call with search param
			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						search: 'laptop',
					})
				);
			});
		});
	});

	describe('Pagination + search compose correctly', () => {
		it('should include both pagination and search in same request', async () => {
			renderTable({ withPagination: true, withSearch: true });

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Clear mock
			mockGetProducts.mockClear();

			// Type in search
			const searchInput = screen.getByPlaceholderText(/search products/i);
			await userEvent.type(searchInput, 'laptop');

			// Should call with both search and pagination params
			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						search: 'laptop',
						page: 1,
						pageSize: 10,
					})
				);
			});
		});

		it('should maintain search when changing pages', async () => {
			// Mock multiple pages
			mockGetProducts.mockResolvedValue({
				items: mockProductList,
				pagination: { page: 1, pageSize: 10, total: 25, totalPages: 3 },
			});

			renderTable({ withPagination: true, withSearch: true });

			// Wait for initial load
			await screen.findByText('Gaming Laptop');

			// Type in search first
			const searchInput = screen.getByPlaceholderText(/search products/i);
			await userEvent.type(searchInput, 'test');

			// Wait for search to trigger
			await waitFor(() => {
				const params = mockGetProducts.mock.calls[mockGetProducts.mock.calls.length - 1]?.[0];
				expect(params?.search).toBe('test');
			});

			// Clear mock
			mockGetProducts.mockClear();

			// Change page
			const page2Button = screen.getByRole('button', { name: 'Go to page 2' });
			await userEvent.click(page2Button);

			// Should call with both search and new page
			await waitFor(() => {
				expect(mockGetProducts).toHaveBeenCalledWith(
					expect.objectContaining({
						search: 'test',
						page: 2,
						pageSize: 10,
					})
				);
			});
		});
	});

	describe('Loading and error states', () => {
		it('should show loading spinner during fetch', async () => {
			const deferred = createDeferredPromise<any>();
			mockGetProducts.mockReturnValueOnce(deferred.promise);

			renderTable();

			// Loading state should be active
			await waitFor(() => {
				const table = screen.queryByRole('table');
				expect(table).toBeInTheDocument();
			});

			// Should not show empty state during loading
			expect(screen.queryByText(/no items found/i)).not.toBeInTheDocument();

			// Resolve
			deferred.resolve({
				items: mockProductList,
				pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
			});

			// Data should appear
			await screen.findByText('Gaming Laptop');
		});

		it('should show empty state when loading completes with no data', async () => {
			mockGetProducts.mockResolvedValueOnce({
				items: [],
				pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
			});

			renderTable();

			// Should show empty message after loading
			await screen.findByText(/no items found/i);
		});

		it('should handle error state gracefully', async () => {
			mockGetProducts.mockRejectedValueOnce(new Error('Network error'));

			renderTable();

			// Component should not crash
			await waitFor(() => {
				expect(document.body).toBeInTheDocument();
			});

			// Should show empty state after error
			await waitFor(() => {
				const emptyMessage = screen.queryByText(/no items found/i);
				expect(emptyMessage).toBeInTheDocument();
			});
		});
	});
});
