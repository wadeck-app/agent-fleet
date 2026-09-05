/**
 * ===========================================================================================
 * DATA TABLE CONTEXT TEST - Approach 4: Context-Children Pattern
 * ===========================================================================================
 *
 * Tests the compound component pattern with context-based state sharing.
 * Validates that:
 * - DataTable fetches data on mount
 * - Context values are accessible to children
 * - Pagination updates trigger refetch
 * - Table body renders rows from context
 * - Error state is handled properly
 *
 * ===========================================================================================
 */
import { MemoryRouter } from 'react-router-dom';

import type { ColumnDef } from '@framework/lego/types/ColTypes';
import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable } from './DataTable';
import { useDataTable } from './DataTableContext';

// Mock product type
interface MockProduct {
	id: string;
	name: string;
	price: number;
}

const mockColumns: ColumnDef<MockProduct>[] = [
	{ key: 'name', label: 'Name', type: 'text' },
	{ key: 'price', label: 'Price', type: 'number' },
];

const mockProducts: MockProduct[] = [
	{ id: '1', name: 'Product A', price: 100 },
	{ id: '2', name: 'Product B', price: 200 },
	{ id: '3', name: 'Product C', price: 300 },
];

describe('DataTableContext (Approach 4)', () => {
	let mockGetProducts: ReturnType<typeof vi.fn>;
	let mockService: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProducts = vi.fn();
		mockService = {
			getProducts: mockGetProducts,
		};
	});

	// Test 1: DataTable fetches products on mount
	it('should fetch products on mount', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		render(
			<MemoryRouter>
				<DataTable service={mockService} columns={mockColumns}>
					<div>Content</div>
				</DataTable>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 1,
					pageSize: 10,
				})
			);
		});
	});

	// Test 2: Items available via context to children
	it('should expose items via context to children', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		// Custom child component that reads context
		function ChildComponent() {
			const ctx = useDataTable<MockProduct>();
			return (
				<div>
					<div data-testid="item-count">{ctx.items.length}</div>
					{ctx.items.map(item => (
						<div key={item.id} data-testid={`item-${item.id}`}>
							{item.name}
						</div>
					))}
				</div>
			);
		}

		render(
			<MemoryRouter>
				<DataTable service={mockService} columns={mockColumns}>
					<ChildComponent />
				</DataTable>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getByTestId('item-count')).toHaveTextContent('3');
		});

		expect(screen.getByTestId('item-1')).toHaveTextContent('Product A');
		expect(screen.getByTestId('item-2')).toHaveTextContent('Product B');
		expect(screen.getByTestId('item-3')).toHaveTextContent('Product C');
	});

	// Test 3: Pagination updates trigger refetch
	it('should trigger refetch when pagination changes', async () => {
		mockGetProducts
			.mockResolvedValueOnce({
				items: mockProducts.slice(0, 2),
				pagination: { page: 1, pageSize: 2, total: 3, totalPages: 2 },
			})
			.mockResolvedValueOnce({
				items: mockProducts.slice(2, 3),
				pagination: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
			});

		// Custom child that can change page
		function ChildWithPagination() {
			const ctx = useDataTable();
			return (
				<div>
					<div data-testid="current-page">{ctx.page}</div>
					// violations-suppress: react/no-raw-button test fixture
					<button onClick={() => ctx.setPage(2)}>Next Page</button>
				</div>
			);
		}

		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<DataTable service={mockService} columns={mockColumns} defaultPageSize={2}>
					<ChildWithPagination />
				</DataTable>
			</MemoryRouter>
		);

		// Initial fetch
		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 1,
					pageSize: 2,
				})
			);
		});

		mockGetProducts.mockClear();

		// Click next page
		await user.click(screen.getByText('Next Page'));

		// Should trigger new fetch
		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 2,
					pageSize: 2,
				})
			);
		});
	});

	// Test 4: Context consumers (DataTable.Body) renders rows from context items
	it('should render table body with rows from context', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		render(
			<MemoryRouter>
				<DataTable service={mockService} columns={mockColumns}>
					<DataTable.Body />
				</DataTable>
			</MemoryRouter>
		);

		// Wait for data to load and table to render
		await waitFor(() => {
			expect(screen.getByText('Product A')).toBeInTheDocument();
		});

		expect(screen.getByText('Product B')).toBeInTheDocument();
		expect(screen.getByText('Product C')).toBeInTheDocument();
	});

	// Test 5: Error state
	it('should handle error state from service', async () => {
		mockGetProducts.mockRejectedValue(new Error('Network error'));

		// Custom child that displays error
		function ChildWithError() {
			const ctx = useDataTable();
			return (
				<div>
					<div data-testid="loading">{ctx.loading ? 'loading' : 'not-loading'}</div>
					<div data-testid="item-count">{ctx.items.length}</div>
				</div>
			);
		}

		render(
			<MemoryRouter>
				<DataTable service={mockService} columns={mockColumns}>
					<ChildWithError />
				</DataTable>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
		});

		// Items should be empty on error
		expect(screen.getByTestId('item-count')).toHaveTextContent('0');
	});

	// Test 6: Loading state transitions
	it('should show loading state during fetch', async () => {
		const deferred = createDeferredPromise<any>();
		mockGetProducts.mockReturnValue(deferred.promise);

		// Custom child that displays loading
		function ChildWithLoading() {
			const ctx = useDataTable();
			return (
				<div>
					<div data-testid="loading">{ctx.loading ? 'loading' : 'not-loading'}</div>
					<div data-testid="item-count">{ctx.items.length}</div>
				</div>
			);
		}

		render(
			<MemoryRouter>
				<DataTable service={mockService} columns={mockColumns}>
					<ChildWithLoading />
				</DataTable>
			</MemoryRouter>
		);

		// Should be loading initially
		await waitFor(() => {
			expect(screen.getByTestId('loading')).toHaveTextContent('loading');
		});

		// Resolve with data
		deferred.resolve({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		// Should transition to not loading
		await waitFor(() => {
			expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
		});

		expect(screen.getByTestId('item-count')).toHaveTextContent('3');
	});
});
