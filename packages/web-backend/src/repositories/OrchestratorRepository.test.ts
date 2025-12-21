import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OrchestratorStats } from '@app/shared-orch-backend';
import { OrchestratorRepository } from './OrchestratorRepository';

describe('OrchestratorRepository', () => {
	const mockOrchestratorUrl = 'http://localhost:3737';
	const cacheTtl = 5000; // 5 seconds

	// Mock fetch globally
	const originalFetch = global.fetch;

	beforeEach(() => {
		// Reset fetch mock before each test
		global.fetch = vi.fn();
	});

	afterEach(() => {
		// Restore original fetch
		global.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	const createMockStats = (): OrchestratorStats => ({
		restPort: 3737,
		wsPort: 3738,
		uptime: 3600000,
		workers: 2,
		workersList: [
			{ id: 'worker-1', type: 'flow', taskId: 'task-1', connectedAt: '2025-12-21T20:00:00.000Z' },
			{ id: 'worker-2', type: 'flow', taskId: null, connectedAt: '2025-12-21T20:00:00.000Z' },
		],
		tasks: {
			total: 5,
			byStatus: {
				IN_PROGRESS: 2,
				REVIEW: 1,
				APPROVED: 1,
				BLOCKED: 1,
			},
		},
	});

	describe('getStats', () => {
		it('should fetch stats from orchestrator API', async () => {
			// Arrange
			const mockStats = createMockStats();
			const mockResponse = {
				ok: true,
				status: 200,
				json: async () => mockStats,
			} as Response;

			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const repository = new OrchestratorRepository(mockOrchestratorUrl, cacheTtl);

			// Act
			const result = await repository.getStats();

			// Assert
			expect(global.fetch).toHaveBeenCalledWith(`${mockOrchestratorUrl}/stats`);
			expect(result).toEqual(mockStats);
		});

		it('should cache results and not refetch within TTL', async () => {
			// Arrange
			const mockStats = createMockStats();
			const mockResponse = {
				ok: true,
				status: 200,
				json: async () => mockStats,
			} as Response;

			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const repository = new OrchestratorRepository(mockOrchestratorUrl, cacheTtl);

			// Act - First call
			const result1 = await repository.getStats();

			// Act - Second call (should use cache)
			const result2 = await repository.getStats();

			// Assert
			expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once
			expect(result1).toEqual(mockStats);
			expect(result2).toEqual(mockStats);
			expect(result1).toBe(result2); // Same object reference
		});

		it('should refetch after TTL expires', async () => {
			// Arrange
			const mockStats1 = createMockStats();
			const mockStats2 = { ...createMockStats(), workers: 3 };

			const mockResponse1 = {
				ok: true,
				status: 200,
				json: async () => mockStats1,
			} as Response;

			const mockResponse2 = {
				ok: true,
				status: 200,
				json: async () => mockStats2,
			} as Response;

			global.fetch = vi.fn().mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

			const shortTtl = 100; // 100ms for testing
			const repository = new OrchestratorRepository(mockOrchestratorUrl, shortTtl);

			// Act - First call
			const result1 = await repository.getStats();

			// Wait for TTL to expire
			await new Promise(resolve => setTimeout(resolve, shortTtl + 10));

			// Act - Second call (should refetch)
			const result2 = await repository.getStats();

			// Assert
			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(result1).toEqual(mockStats1);
			expect(result2).toEqual(mockStats2);
		});

		it('should return stale cache on fetch error if cache exists', async () => {
			// Arrange
			const mockStats = createMockStats();
			const mockSuccessResponse = {
				ok: true,
				status: 200,
				json: async () => mockStats,
			} as Response;

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce(mockSuccessResponse) // First call succeeds
				.mockRejectedValueOnce(new Error('Network error')); // Second call fails

			const shortTtl = 100; // 100ms for testing
			const repository = new OrchestratorRepository(mockOrchestratorUrl, shortTtl);

			// Act - First call (populate cache)
			const result1 = await repository.getStats();

			// Wait for TTL to expire
			await new Promise(resolve => setTimeout(resolve, shortTtl + 10));

			// Act - Second call (fetch fails, should return stale cache)
			const result2 = await repository.getStats();

			// Assert
			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(result1).toEqual(mockStats);
			expect(result2).toEqual(mockStats); // Returns stale cache
		});

		it('should throw error if fetch fails and no cache exists', async () => {
			// Arrange
			global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

			const repository = new OrchestratorRepository(mockOrchestratorUrl, cacheTtl);

			// Act & Assert
			await expect(repository.getStats()).rejects.toThrow('Failed to fetch orchestrator stats: Network error');
		});

		it('should throw error if API returns non-OK status and no cache exists', async () => {
			// Arrange
			const mockErrorResponse = {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
			} as Response;

			global.fetch = vi.fn().mockResolvedValue(mockErrorResponse);

			const repository = new OrchestratorRepository(mockOrchestratorUrl, cacheTtl);

			// Act & Assert
			await expect(repository.getStats()).rejects.toThrow(
				'Failed to fetch orchestrator stats: Orchestrator API returned 500: Internal Server Error'
			);
		});

		it('should validate response schema and throw if invalid', async () => {
			// Arrange
			const invalidData = {
				// Missing required fields
				restPort: 3737,
			};

			const mockResponse = {
				ok: true,
				status: 200,
				json: async () => invalidData,
			} as Response;

			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const repository = new OrchestratorRepository(mockOrchestratorUrl, cacheTtl);

			// Act & Assert
			await expect(repository.getStats()).rejects.toThrow();
		});
	});

	describe('clearCache', () => {
		it('should clear the cache', async () => {
			// Arrange
			const mockStats = createMockStats();
			const mockResponse = {
				ok: true,
				status: 200,
				json: async () => mockStats,
			} as Response;

			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const repository = new OrchestratorRepository(mockOrchestratorUrl, cacheTtl);

			// Act - Populate cache
			await repository.getStats();

			// Clear cache
			repository.clearCache();

			// Act - Should refetch after clear
			await repository.getStats();

			// Assert
			expect(global.fetch).toHaveBeenCalledTimes(2); // Called twice (once before clear, once after)
		});
	});
});
