/**
 * ===========================================================================================
 * DATA2 DETAIL PANEL TEST SUITE (A6 - Data2-Based)
 * ===========================================================================================
 *
 * Tests the Data2DetailPanel component behavior:
 * - Data fetching when selectedId changes
 * - Loading states
 * - Empty state (no selection)
 * - Error handling
 * - Column rendering with custom render functions
 *
 * ===========================================================================================
 */
import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Data2DetailPanel } from './Data2DetailPanel';

// Mock service
const mockGetProduct = vi.fn();
const mockService = {
	getProduct: mockGetProduct,
};

const mockProduct = {
	id: 'prod-1',
	name: 'Gaming Laptop',
	category: 'Electronics',
	price: 1299.99,
	stock: 15,
	status: 'active',
	rating: 4.5,
	featured: true,
	description: 'High-performance gaming laptop',
};

const mockColumns = [
	{ key: 'name', label: 'Product Name' },
	{ key: 'category', label: 'Category' },
	{
		key: 'price',
		label: 'Price',
		render: (item: typeof mockProduct) => `$${item.price.toFixed(2)}`,
	},
	{ key: 'stock', label: 'Stock' },
];

describe('Data2DetailPanel (A6)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProduct.mockResolvedValue(mockProduct);
	});

	const renderPanel = (selectedId?: string) => {
		return render(
			<Data2DetailPanel service={mockService} columns={mockColumns} selectedId={selectedId} title="Product Details" />
		);
	};

	describe('Empty state (no selection)', () => {
		it('should show empty state when selectedId is undefined', async () => {
			renderPanel(undefined);

			await waitFor(() => {
				expect(screen.getByText(/select an item to view details/i)).toBeInTheDocument();
			});

			// Should not call service
			expect(mockGetProduct).not.toHaveBeenCalled();
		});

		it('should show title even when no selection', () => {
			renderPanel(undefined);

			expect(screen.getByText('Product Details')).toBeInTheDocument();
		});
	});

	describe('Data fetching when selectedId changes', () => {
		it('should call service.getProduct when selectedId is provided', async () => {
			renderPanel('prod-1');

			await waitFor(() => {
				expect(mockGetProduct).toHaveBeenCalledWith('prod-1');
			});
		});

		it('should display fetched product data', async () => {
			renderPanel('prod-1');

			await screen.findByText('Gaming Laptop');
			expect(screen.getByText('Electronics')).toBeInTheDocument();
		});

		it('should refetch when selectedId changes', async () => {
			const { rerender } = renderPanel('prod-1');

			// Wait for first fetch
			await waitFor(() => {
				expect(mockGetProduct).toHaveBeenCalledWith('prod-1');
			});

			// Clear mock
			mockGetProduct.mockClear();

			// Mock different product
			const anotherProduct = { ...mockProduct, id: 'prod-2', name: 'Coffee Beans' };
			mockGetProduct.mockResolvedValue(anotherProduct);

			// Change selectedId
			rerender(
				<Data2DetailPanel
					service={mockService}
					columns={mockColumns}
					selectedId="prod-2"
					title="Product Details"
				/>
			);

			// Should call service with new ID
			await waitFor(() => {
				expect(mockGetProduct).toHaveBeenCalledWith('prod-2');
			});

			// Should show new product
			await screen.findByText('Coffee Beans');
		});

		it('should clear item when selectedId becomes undefined', async () => {
			const { rerender } = renderPanel('prod-1');

			// Wait for data to load
			await screen.findByText('Gaming Laptop');

			// Clear selection
			rerender(
				<Data2DetailPanel service={mockService} columns={mockColumns} selectedId={undefined} title="Product Details" />
			);

			// Should show empty state
			await waitFor(() => {
				expect(screen.getByText(/select an item to view details/i)).toBeInTheDocument();
			});

			// Product data should be gone
			expect(screen.queryByText('Gaming Laptop')).not.toBeInTheDocument();
		});
	});

	describe('Loading states', () => {
		it('should show loading indicator during fetch', async () => {
			const deferred = createDeferredPromise<typeof mockProduct>();
			mockGetProduct.mockReturnValueOnce(deferred.promise);

			renderPanel('prod-1');

			// Loading dots should be visible (check for presence of loading indicator)
			await waitFor(() => {
				// LoadingDots component renders, check for card content
				expect(screen.queryByText(/select an item/i)).not.toBeInTheDocument();
			});

			// Resolve the promise
			deferred.resolve(mockProduct);

			// Data should appear
			await screen.findByText('Gaming Laptop');
		});

		it('should hide loading indicator after fetch completes', async () => {
			renderPanel('prod-1');

			// Wait for data to load
			await screen.findByText('Gaming Laptop');

			// Loading should be complete (data is visible)
			expect(screen.getByText('Electronics')).toBeInTheDocument();
		});
	});

	describe('Error handling', () => {
		it('should show error message when service throws', async () => {
			mockGetProduct.mockRejectedValueOnce(new Error('Network error'));

			renderPanel('prod-1');

			// Wait for error to be handled
			await waitFor(() => {
				expect(screen.getByText(/error:/i)).toBeInTheDocument();
			});

			// Should show error message
			expect(screen.getByText(/network error/i)).toBeInTheDocument();
		});

		it('should clear error when refetching succeeds', async () => {
			mockGetProduct.mockRejectedValueOnce(new Error('Network error'));

			const { rerender } = renderPanel('prod-1');

			// Wait for error
			await screen.findByText(/network error/i);

			// Mock successful response
			mockGetProduct.mockResolvedValue(mockProduct);

			// Change selectedId to trigger refetch
			rerender(
				<Data2DetailPanel service={mockService} columns={mockColumns} selectedId="prod-2" title="Product Details" />
			);

			// Wait for data to load
			await screen.findByText('Gaming Laptop');

			// Error should be gone
			expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
		});

		it('should not show item when error occurs', async () => {
			mockGetProduct.mockRejectedValueOnce(new Error('Network error'));

			renderPanel('prod-1');

			// Wait for error
			await screen.findByText(/network error/i);

			// Item data should not be shown
			expect(screen.queryByText('Gaming Laptop')).not.toBeInTheDocument();
		});
	});

	describe('Column rendering with custom render functions', () => {
		it('should render columns with default values (no render function)', async () => {
			renderPanel('prod-1');

			await screen.findByText('Gaming Laptop');

			// Check labels
			expect(screen.getByText('Product Name')).toBeInTheDocument();
			expect(screen.getByText('Category')).toBeInTheDocument();

			// Check values (without custom render)
			expect(screen.getByText('Electronics')).toBeInTheDocument();
		});

		it('should use custom render function when provided', async () => {
			renderPanel('prod-1');

			await screen.findByText('Gaming Laptop');

			// Price column has custom render function
			expect(screen.getByText('$1299.99')).toBeInTheDocument();
		});

		it('should render multiple fields correctly', async () => {
			renderPanel('prod-1');

			await screen.findByText('Gaming Laptop');

			// Check all column values
			expect(screen.getByText('Product Name')).toBeInTheDocument();
			expect(screen.getByText('Gaming Laptop')).toBeInTheDocument();

			expect(screen.getByText('Category')).toBeInTheDocument();
			expect(screen.getByText('Electronics')).toBeInTheDocument();

			expect(screen.getByText('Price')).toBeInTheDocument();
			expect(screen.getByText('$1299.99')).toBeInTheDocument();

			expect(screen.getByText('Stock')).toBeInTheDocument();
			expect(screen.getByText('15')).toBeInTheDocument();
		});
	});
});
