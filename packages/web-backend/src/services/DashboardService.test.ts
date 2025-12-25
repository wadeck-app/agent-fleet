import type { OrchestratorStats } from 'shared-orch-worker/domain-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import { DashboardService } from './DashboardService';

describe('DashboardService', () => {
	let mockRepository: OrchestratorRepository;
	let service: DashboardService;

	beforeEach(() => {
		// Create mock repository
		mockRepository = {
			getStats: vi.fn(),
			getTasks: vi.fn().mockResolvedValue([]),
			clearCache: vi.fn(),
		} as unknown as OrchestratorRepository;

		service = new DashboardService(mockRepository);
	});

	const createMockStats = (overrides?: Partial<OrchestratorStats>): OrchestratorStats => ({
		restPort: 3737,
		wsPort: 3738,
		version: '1.0.0',
		uptime: 3600000,
		workers: 3,
		workersList: [
			{ id: 'worker-1', taskId: 'task-1', connectedAt: '2025-12-21T20:00:00.000Z' },
			{ id: 'worker-2', taskId: 'task-2', connectedAt: '2025-12-21T20:00:00.000Z' },
			{ id: 'worker-3', taskId: null, connectedAt: '2025-12-21T20:00:00.000Z' },
		],
		tasks: {
			total: 10,
			byStatus: {
				IN_PROGRESS: 2,
				TESTING: 1,
				REVIEW: 2,
				APPROVED: 3,
				MERGED: 1,
				BLOCKED: 1,
				CANCELLED: 0,
			},
		},
		...overrides,
	});

	describe('getDashboardData', () => {
		it('should transform orchestrator stats into dashboard DTO', async () => {
			// Arrange
			const mockStats = createMockStats();
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(mockRepository.getStats).toHaveBeenCalledTimes(1);
			expect(result).toMatchObject({
				orchestrator: {
					status: 'ready',
					uptime: 3600000,
					version: '1.0.0',
				},
				workers: {
					connected: 3,
					idle: 1, // worker-3 has no taskId
					busy: 2, // worker-1 and worker-2 have taskIds
				},
				tasks: {
					total: 10,
					active: 3, // IN_PROGRESS (2) + TESTING (1)
					review: 2, // REVIEW (2)
					done: 4, // APPROVED (3) + MERGED (1)
					blocked: 1, // BLOCKED (1)
					failed: 0, // CANCELLED (0)
				},
			});
			expect(result.timestamp).toBeDefined();
		});

		it('should correctly calculate worker states (all idle)', async () => {
			// Arrange
			const mockStats = createMockStats({
				workers: 3,
				workersList: [
					{ id: 'worker-1', taskId: null, connectedAt: '2025-12-21T20:00:00.000Z' },
					{ id: 'worker-2', taskId: null, connectedAt: '2025-12-21T20:00:00.000Z' },
					{ id: 'worker-3', taskId: null, connectedAt: '2025-12-21T20:00:00.000Z' },
				],
			});
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.workers).toEqual({
				connected: 3,
				idle: 3,
				busy: 0,
			});
		});

		it('should correctly calculate worker states (all busy)', async () => {
			// Arrange
			const mockStats = createMockStats({
				workers: 3,
				workersList: [
					{ id: 'worker-1', taskId: 'task-1', connectedAt: '2025-12-21T20:00:00.000Z' },
					{ id: 'worker-2', taskId: 'task-2', connectedAt: '2025-12-21T20:00:00.000Z' },
					{ id: 'worker-3', taskId: 'task-3', connectedAt: '2025-12-21T20:00:00.000Z' },
				],
			});
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.workers).toEqual({
				connected: 3,
				idle: 0,
				busy: 3,
			});
		});

		it('should handle missing status keys in aggregation', async () => {
			// Arrange
			const mockStats = createMockStats({
				tasks: {
					total: 2,
					byStatus: {
						IN_PROGRESS: 2,
						// Missing TESTING, REVIEW, APPROVED, MERGED, BLOCKED, CANCELLED
					},
				},
			});
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.tasks).toEqual({
				total: 2,
				active: 2, // IN_PROGRESS (2) + TESTING (0)
				review: 0, // REVIEW (0)
				done: 0, // APPROVED (0) + MERGED (0)
				blocked: 0, // BLOCKED (0)
				failed: 0, // CANCELLED (0)
			});
		});

		it('should aggregate task statuses correctly (complex scenario)', async () => {
			// Arrange
			const mockStats = createMockStats({
				tasks: {
					total: 25,
					byStatus: {
						IN_PROGRESS: 5,
						TESTING: 3,
						REVIEW: 4,
						APPROVED: 6,
						MERGED: 2,
						BLOCKED: 3,
						CANCELLED: 2,
					},
				},
			});
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.tasks).toEqual({
				total: 25,
				active: 8, // IN_PROGRESS (5) + TESTING (3)
				review: 4, // REVIEW (4)
				done: 8, // APPROVED (6) + MERGED (2)
				blocked: 3, // BLOCKED (3)
				failed: 2, // CANCELLED (2)
			});
		});

		it('should handle empty workers list', async () => {
			// Arrange
			const mockStats = createMockStats({
				workers: 0,
				workersList: [],
			});
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.workers).toEqual({
				connected: 0,
				idle: 0,
				busy: 0,
			});
		});

		it('should handle empty tasks', async () => {
			// Arrange
			const mockStats = createMockStats({
				tasks: {
					total: 0,
					byStatus: {},
				},
			});
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.tasks).toEqual({
				total: 0,
				active: 0,
				review: 0,
				done: 0,
				blocked: 0,
				failed: 0,
			});
		});

		it('should return offline state if repository throws', async () => {
			// Arrange
			vi.mocked(mockRepository.getStats).mockRejectedValue(new Error('Network error'));

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.orchestrator.status).toBe('offline');
			expect(result.workers.connected).toBe(0);
			expect(result.tasks.total).toBe(0);
		});

		it('should return offline state with unknown error', async () => {
			// Arrange
			vi.mocked(mockRepository.getStats).mockRejectedValue('String error');

			// Act
			const result = await service.getDashboardData();

			// Assert
			expect(result.orchestrator.status).toBe('offline');
			expect(result.workers.connected).toBe(0);
			expect(result.tasks.total).toBe(0);
		});

		it('should generate valid ISO timestamp', async () => {
			// Arrange
			const mockStats = createMockStats();
			vi.mocked(mockRepository.getStats).mockResolvedValue(mockStats);

			const beforeTimestamp = new Date().toISOString();

			// Act
			const result = await service.getDashboardData();

			const afterTimestamp = new Date().toISOString();

			// Assert
			expect(result.timestamp).toBeDefined();
			expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
			expect(result.timestamp >= beforeTimestamp).toBe(true);
			expect(result.timestamp <= afterTimestamp).toBe(true);
		});
	});
});
