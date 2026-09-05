/**
 * ===========================================================================================
 * USE PIPELINE HOOK TEST - Approach 5: Query-Modifier Pipeline
 * ===========================================================================================
 *
 * Tests the query-modifier pipeline approach.
 * Validates that:
 * - usePipeline fetches products on mount
 * - Modifiers compose query correctly
 * - Context values are accessible via PipelineProvider
 * - Cache invalidation triggers refetch
 * - Search modifier resets pagination
 *
 * ===========================================================================================
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BaseQuery } from './PipelineTypes';
import { withPagination, withSearch, withSort } from './PipelineTypes';
import type { PipelineService } from './usePipeline';
import { usePipeline } from './usePipeline';

// Mock product type
interface MockProduct {
	id: string;
	name: string;
	price: number;
}

const mockProducts: MockProduct[] = [
	{ id: '1', name: 'Product A', price: 100 },
	{ id: '2', name: 'Product B', price: 200 },
	{ id: '3', name: 'Product C', price: 300 },
];

describe('usePipeline (Approach 5)', () => {
	let mockGetProducts: ReturnType<typeof vi.fn>;
	let mockService: PipelineService;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProducts = vi.fn();
		mockService = {
			getProducts: mockGetProducts,
		} as unknown as PipelineService;
	});

	// Test 1: usePipeline fetches products on mount
	it('should fetch products on mount', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		const modifiers = [withPagination(1, 10)];

		const { result } = renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 1,
					pageSize: 10,
				})
			);
		});

		await waitFor(() => {
			expect(result.current.items).toHaveLength(3);
		});
	});

	// Test 2: Modifiers compose query correctly
	it('should compose query from multiple modifiers', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		const modifiers = [withPagination(2, 20), withSearch('laptop'), withSort('price', 'desc')];

		renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					page: 2,
					pageSize: 20,
					search: 'laptop',
					sortBy: 'price',
					sortOrder: 'desc',
				})
			);
		});
	});

	// Test 3: Context values accessible via result
	it('should expose items, loading, error via hook result', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		const modifiers = [withPagination(1, 10)];

		const { result } = renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		// Loading starts as false (changed from true to false after initial fetch)
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Items should be populated
		expect(result.current.items).toHaveLength(3);
		expect(result.current.error).toBeNull();
		expect(result.current.pagination).toEqual({
			page: 1,
			pageSize: 10,
			total: 3,
			totalPages: 1,
		});
	});

	// Test 4: Cache invalidation triggers refetch (modifier change)
	it('should refetch when modifiers change', async () => {
		mockGetProducts
			.mockResolvedValueOnce({
				items: mockProducts.slice(0, 2),
				pagination: { page: 1, pageSize: 2, total: 3, totalPages: 2 },
			})
			.mockResolvedValueOnce({
				items: mockProducts.slice(2, 3),
				pagination: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
			});

		const initialModifiers = [withPagination(1, 2)];

		const { result, rerender } = renderHook(({ mods }) => usePipeline<MockProduct>(mods, mockService), {
			initialProps: { mods: initialModifiers },
		});

		// Initial fetch -- wait for both the call and the state update
		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledTimes(1);
			expect(result.current.items).toHaveLength(2);
		});

		// Change modifiers (new page)
		const newModifiers = [withPagination(2, 2)];
		rerender({ mods: newModifiers });

		// Should trigger new fetch
		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledTimes(2);
		});

		await waitFor(() => {
			expect(result.current.items).toHaveLength(1);
		});
	});

	// Test 5: Search modifier resets pagination
	it('should reset pagination when search changes', async () => {
		mockGetProducts
			.mockResolvedValueOnce({
				items: mockProducts,
				pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
			})
			.mockResolvedValueOnce({
				items: [mockProducts[0]],
				pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
			});

		const modifiers = [withPagination(1, 10)];

		const { result } = renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.items).toHaveLength(3);
		});

		mockGetProducts.mockClear();

		// Change search (should reset page to 1)
		result.current.setSearch('laptop');

		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					search: 'laptop',
					page: 1, // Reset to page 1
				})
			);
		});
	});

	// Test 6: Error handling
	it('should handle errors from service', async () => {
		mockGetProducts.mockRejectedValue(new Error('Network error'));

		const modifiers = [withPagination(1, 10)];

		const { result } = renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		await waitFor(() => {
			expect(result.current.error).toBe('Network error');
		});

		expect(result.current.items).toHaveLength(0);
		expect(result.current.loading).toBe(false);
	});

	// Test 7: Query composition order
	it('should apply modifiers in sequence', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		// Create custom modifiers to test ordering
		const modifier1 = (query: BaseQuery) => ({ ...query, custom1: 'value1' });
		const modifier2 = (query: BaseQuery) => ({ ...query, custom2: 'value2' });
		const modifier3 = (query: BaseQuery) => ({ ...query, custom1: 'overridden' }); // Override custom1

		const modifiers = [modifier1, modifier2, modifier3];

		renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledWith(
				expect.objectContaining({
					custom1: 'overridden', // Last modifier wins
					custom2: 'value2',
				})
			);
		});
	});

	// Test 8: Manual refresh
	it('should refetch data when refresh is called', async () => {
		mockGetProducts.mockResolvedValue({
			items: mockProducts,
			pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
		});

		const modifiers = [withPagination(1, 10)];

		const { result } = renderHook(() => usePipeline<MockProduct>(modifiers, mockService));

		// Wait for initial load
		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledTimes(1);
		});

		mockGetProducts.mockClear();

		// Call refresh
		await result.current.refresh();

		// Should trigger new fetch
		await waitFor(() => {
			expect(mockGetProducts).toHaveBeenCalledTimes(1);
		});
	});
});
