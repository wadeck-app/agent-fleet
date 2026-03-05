import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import type { OrchestratorStats } from 'shared-orch-worker/domain-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { WorkersRepository } from '../repositories/WorkersRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { WorkersService } from './WorkersService';

describe('WorkersService.getWorker', () => {
	let mockOrchestratorWrapper: OrchestratorWrapper;
	let mockEventBroadcaster: EventBroadcaster;
	let mockWorkersRepository: WorkersRepository;
	let service: WorkersService;

	beforeEach(() => {
		// Create mock orchestrator wrapper
		mockOrchestratorWrapper = {
			getStats: vi.fn(),
			getOrchestrator: vi.fn(),
		} as unknown as OrchestratorWrapper;

		// Create mock event broadcaster
		mockEventBroadcaster = {
			broadcast: vi.fn(),
			broadcastExcept: vi.fn(),
		} as unknown as EventBroadcaster;

		// Create mock workers repository
		mockWorkersRepository = {
			findByWorkerId: vi.fn(),
			findAll: vi.fn(),
			updateName: vi.fn(),
			deleteByWorkerId: vi.fn(),
		} as unknown as WorkersRepository;

		service = new WorkersService(mockOrchestratorWrapper, mockEventBroadcaster, mockWorkersRepository);
	});

	const createMockStats = (
		workers: Array<{ id: string; taskId: string | null; taskStartedAt?: string }>
	): OrchestratorStats => ({
		restPort: 3737,
		wsPort: 3738,
		version: '1.0.0',
		uptime: 3600000,
		workers: workers.length,
		workersList: workers.map(w => ({
			id: w.id,
			taskId: w.taskId,
			taskStartedAt: w.taskStartedAt ?? null,
			connectedAt: '2025-12-21T20:00:00.000Z',
		})),
		tasks: {
			total: 0,
			byStatus: {},
		},
	});

	describe('getWorker', () => {
		it('should return connected worker with full data (runtime + workspace + metadata)', async () => {
			// Arrange
			const workerId = 'worker-1';
			const mockStats = createMockStats([
				{ id: workerId, taskId: 'task-1', taskStartedAt: '2025-12-21T20:00:00.000Z' },
			]);

			const mockOrchestrator = {
				getWsServer: vi.fn().mockReturnValue({
					getConnectionManager: vi.fn().mockReturnValue({
						getConnectedWorkspaces: vi.fn().mockReturnValue([
							{
								workerId,
								workspacePath: '/path/to/workspace',
								projectId: 'project-1',
								connectedAt: '2025-12-21T20:00:00.000Z',
								gitBranch: 'main',
							},
						]),
					}),
				}),
			};

			vi.mocked(mockOrchestratorWrapper.getStats).mockResolvedValue(mockStats);
			vi.mocked(mockOrchestratorWrapper.getOrchestrator).mockReturnValue(mockOrchestrator as any);
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue({
				id: '1',
				workerId,
				name: 'Test Worker',
				version: 2,
				createdAt: '2025-12-21T20:00:00.000Z',
				updatedAt: '2025-12-21T20:00:00.000Z',
			});

			// Act
			const result = await service.getWorker(workerId);

			// Assert
			expect(result).toEqual({
				workerId,
				name: 'Test Worker',
				version: 2,
				connected: true,
				taskId: 'task-1',
				state: 'busy',
				taskStartedAt: '2025-12-21T20:00:00.000Z',
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
				projectId: 'project-1',
				workspacePath: '/path/to/workspace',
			});
		});

		it('should return connected worker without workspace data', async () => {
			// Arrange
			const workerId = 'worker-2';
			const mockStats = createMockStats([{ id: workerId, taskId: null }]);

			const mockOrchestrator = {
				getWsServer: vi.fn().mockReturnValue({
					getConnectionManager: vi.fn().mockReturnValue({
						getConnectedWorkspaces: vi.fn().mockReturnValue([]),
					}),
				}),
			};

			vi.mocked(mockOrchestratorWrapper.getStats).mockResolvedValue(mockStats);
			vi.mocked(mockOrchestratorWrapper.getOrchestrator).mockReturnValue(mockOrchestrator as any);
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue(null);

			// Act
			const result = await service.getWorker(workerId);

			// Assert
			expect(result).toEqual({
				workerId,
				name: undefined,
				version: undefined,
				connected: true,
				taskId: undefined,
				state: 'idle',
				taskStartedAt: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
				projectId: undefined,
				workspacePath: undefined,
			});
		});

		it('should return disconnected worker when not in orchestrator but has metadata', async () => {
			// Arrange
			const workerId = 'worker-3';
			const mockStats = createMockStats([]);

			vi.mocked(mockOrchestratorWrapper.getStats).mockResolvedValue(mockStats);
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue({
				id: '1',
				workerId,
				name: 'Disconnected Worker',
				version: 1,
				createdAt: '2025-12-21T20:00:00.000Z',
				updatedAt: '2025-12-21T20:00:00.000Z',
			});

			// Act
			const result = await service.getWorker(workerId);

			// Assert
			expect(result).toEqual({
				workerId,
				name: 'Disconnected Worker',
				version: 1,
				connected: false,
				state: 'idle',
				taskId: undefined,
				taskStartedAt: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
				projectId: undefined,
				workspacePath: undefined,
			});
		});

		it('should throw NotFoundException when worker not in orchestrator and no metadata', async () => {
			// Arrange
			const workerId = 'unknown-worker';
			const mockStats = createMockStats([]);

			vi.mocked(mockOrchestratorWrapper.getStats).mockResolvedValue(mockStats);
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue(null);

			// Act & Assert
			await expect(service.getWorker(workerId)).rejects.toThrow(NotFoundException);
			await expect(service.getWorker(workerId)).rejects.toThrow(`Worker ${workerId} not found`);

			try {
				await service.getWorker(workerId);
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
				expect((error as NotFoundException).code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
				expect((error as NotFoundException).details).toEqual({ workerId });
			}
		});

		it('should return disconnected worker when orchestrator is offline but has metadata', async () => {
			// Arrange
			const workerId = 'worker-4';

			vi.mocked(mockOrchestratorWrapper.getStats).mockRejectedValue(new Error('Orchestrator offline'));
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue({
				id: '1',
				workerId,
				name: 'Offline Worker',
				version: 3,
				createdAt: '2025-12-21T20:00:00.000Z',
				updatedAt: '2025-12-21T20:00:00.000Z',
			});

			// Act
			const result = await service.getWorker(workerId);

			// Assert
			expect(result).toEqual({
				workerId,
				name: 'Offline Worker',
				version: 3,
				connected: false,
				state: 'idle',
				taskId: undefined,
				taskStartedAt: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
				projectId: undefined,
				workspacePath: undefined,
			});
		});

		it('should throw NotFoundException when orchestrator is offline and no metadata', async () => {
			// Arrange
			const workerId = 'unknown-worker-offline';

			vi.mocked(mockOrchestratorWrapper.getStats).mockRejectedValue(new Error('Orchestrator offline'));
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue(null);

			// Act & Assert
			await expect(service.getWorker(workerId)).rejects.toThrow(NotFoundException);
			await expect(service.getWorker(workerId)).rejects.toThrow(`Worker ${workerId} not found`);
		});

		it('should handle worker with idle state (no taskId)', async () => {
			// Arrange
			const workerId = 'worker-5';
			const mockStats = createMockStats([{ id: workerId, taskId: null }]);

			const mockOrchestrator = {
				getWsServer: vi.fn().mockReturnValue({
					getConnectionManager: vi.fn().mockReturnValue({
						getConnectedWorkspaces: vi.fn().mockReturnValue([
							{
								workerId,
								workspacePath: '/path/to/workspace',
								projectId: 'project-2',
								connectedAt: '2025-12-21T20:00:00.000Z',
							},
						]),
					}),
				}),
			};

			vi.mocked(mockOrchestratorWrapper.getStats).mockResolvedValue(mockStats);
			vi.mocked(mockOrchestratorWrapper.getOrchestrator).mockReturnValue(mockOrchestrator as any);
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue(null);

			// Act
			const result = await service.getWorker(workerId);

			// Assert
			expect(result.state).toBe('idle');
			expect(result.taskId).toBeUndefined();
			expect(result.taskStartedAt).toBeUndefined();
		});

		it('should handle worker with busy state (has taskId)', async () => {
			// Arrange
			const workerId = 'worker-6';
			const mockStats = createMockStats([
				{ id: workerId, taskId: 'task-2', taskStartedAt: '2025-12-21T21:00:00.000Z' },
			]);

			const mockOrchestrator = {
				getWsServer: vi.fn().mockReturnValue({
					getConnectionManager: vi.fn().mockReturnValue({
						getConnectedWorkspaces: vi.fn().mockReturnValue([]),
					}),
				}),
			};

			vi.mocked(mockOrchestratorWrapper.getStats).mockResolvedValue(mockStats);
			vi.mocked(mockOrchestratorWrapper.getOrchestrator).mockReturnValue(mockOrchestrator as any);
			vi.mocked(mockWorkersRepository.findByWorkerId).mockResolvedValue(null);

			// Act
			const result = await service.getWorker(workerId);

			// Assert
			expect(result.state).toBe('busy');
			expect(result.taskId).toBe('task-2');
			expect(result.taskStartedAt).toBe('2025-12-21T21:00:00.000Z');
		});
	});
});
