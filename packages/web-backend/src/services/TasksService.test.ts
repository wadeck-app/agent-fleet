import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TasksService } from './TasksService';
import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TasksService', () => {
	let mockRepository: OrchestratorRepository;
	let service: TasksService;

	beforeEach(() => {
		// Create mock repository
		mockRepository = {
			getStats: vi.fn(),
			clearCache: vi.fn(),
		} as unknown as OrchestratorRepository;

		service = new TasksService(mockRepository);

		// Reset fetch mock
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	const createMockTasks = () => [
		{
			id: 'task-1',
			description: 'Implement user authentication',
			status: 'in_progress',
			priority: 'high',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-02T00:00:00.000Z',
			assignedTo: {
				workerId: 'worker-1',
				workerType: 'dev',
			},
			flowId: 'flow-123',
			flowResult: {
				status: 'completed',
			},
		},
		{
			id: 'task-2',
			description: 'Fix login bug',
			status: 'review',
			priority: 'urgent',
			createdAt: '2024-01-01T01:00:00.000Z',
			updatedAt: '2024-01-02T01:00:00.000Z',
			assignedTo: {
				workerId: 'worker-2',
				workerType: 'dev',
			},
		},
		{
			id: 'task-3',
			description: 'Update documentation',
			status: 'todo',
			priority: 'low',
			createdAt: '2024-01-01T02:00:00.000Z',
			updatedAt: '2024-01-02T02:00:00.000Z',
			assignedTo: null,
		},
	];

	describe('getTasksData', () => {
		it('should fetch and transform tasks successfully', async () => {
			// Arrange
			const mockTasks = createMockTasks();
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith('http://localhost:3737/tasks');
			expect(result.tasks).toHaveLength(3);
			expect(result.summary.total).toBe(3);
			expect(result.summary.byStatus).toEqual({
				in_progress: 1,
				review: 1,
				todo: 1,
			});
			expect(result.summary.byPriority).toEqual({
				high: 1,
				urgent: 1,
				low: 1,
			});
			expect(result.timestamp).toBeDefined();
		});

		it('should transform task fields correctly', async () => {
			// Arrange
			const mockTasks = createMockTasks();
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			const task1 = result.tasks[0];
			expect(task1.id).toBe('task-1');
			expect(task1.description).toBe('Implement user authentication');
			expect(task1.status).toBe('in_progress');
			expect(task1.priority).toBe('high');
			expect(task1.assignedWorker).toEqual({
				workerId: 'worker-1',
				workerType: 'dev',
			});
			expect(task1.flowId).toBe('flow-123');
			expect(task1.flowResult).toEqual({ status: 'completed' });
		});

		it('should handle tasks with null assignedTo', async () => {
			// Arrange
			const mockTasks = [
				{
					id: 'task-1',
					description: 'Unassigned task',
					status: 'backlog',
					priority: 'medium',
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					assignedTo: null,
				},
			];
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(result.tasks[0].assignedWorker).toBeNull();
		});

		it('should filter by status using query parameter', async () => {
			// Arrange
			const mockTasks = createMockTasks().filter(t => t.status === 'review');
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData({ status: 'review' });

			// Assert
			expect(mockFetch).toHaveBeenCalledWith('http://localhost:3737/tasks?status=review');
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].status).toBe('review');
		});

		it('should filter by workerId client-side', async () => {
			// Arrange
			const mockTasks = createMockTasks();
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData({ workerId: 'worker-1' });

			// Assert
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe('task-1');
			expect(result.tasks[0].assignedWorker?.workerId).toBe('worker-1');
		});

		it('should filter by priority client-side', async () => {
			// Arrange
			const mockTasks = createMockTasks();
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData({ priority: 'urgent' });

			// Assert
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe('task-2');
			expect(result.tasks[0].priority).toBe('urgent');
		});

		it('should apply multiple filters together', async () => {
			// Arrange
			const mockTasks = [
				...createMockTasks(),
				{
					id: 'task-4',
					description: 'Another urgent task for worker-1',
					status: 'todo',
					priority: 'urgent',
					createdAt: '2024-01-01T03:00:00.000Z',
					updatedAt: '2024-01-02T03:00:00.000Z',
					assignedTo: {
						workerId: 'worker-1',
						workerType: 'dev',
					},
				},
			];
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData({ workerId: 'worker-1', priority: 'urgent' });

			// Assert
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe('task-4');
		});

		it('should handle empty tasks array', async () => {
			// Arrange
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => [],
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(result.tasks).toHaveLength(0);
			expect(result.summary.total).toBe(0);
			expect(result.summary.byStatus).toEqual({});
			expect(result.summary.byPriority).toEqual({});
		});

		it('should handle non-array response', async () => {
			// Arrange
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ error: 'Invalid response' }),
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(result.tasks).toHaveLength(0);
			expect(result.summary.total).toBe(0);
		});

		it('should return empty data on fetch error', async () => {
			// Arrange
			mockFetch.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(result.tasks).toHaveLength(0);
			expect(result.summary.total).toBe(0);
			expect(result.summary.byStatus).toEqual({});
			expect(result.summary.byPriority).toEqual({});
		});

		it('should return empty data on network error', async () => {
			// Arrange
			mockFetch.mockRejectedValue(new Error('Network error'));

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(result.tasks).toHaveLength(0);
			expect(result.summary.total).toBe(0);
		});

		it('should use ORCHESTRATOR_URL from environment', async () => {
			// Arrange
			const originalEnv = process.env.ORCHESTRATOR_URL;
			process.env.ORCHESTRATOR_URL = 'http://custom-orchestrator:9999';

			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => [],
			});

			// Act
			await service.getTasksData();

			// Assert
			expect(mockFetch).toHaveBeenCalledWith('http://custom-orchestrator:9999/tasks');

			// Cleanup
			if (originalEnv) {
				process.env.ORCHESTRATOR_URL = originalEnv;
			} else {
				delete process.env.ORCHESTRATOR_URL;
			}
		});

		it('should generate valid ISO timestamp', async () => {
			// Arrange
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => [],
			});

			const beforeTimestamp = new Date().toISOString();

			// Act
			const result = await service.getTasksData();

			const afterTimestamp = new Date().toISOString();

			// Assert
			expect(result.timestamp).toBeDefined();
			expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
			expect(result.timestamp >= beforeTimestamp).toBe(true);
			expect(result.timestamp <= afterTimestamp).toBe(true);
		});

		it('should calculate summary statistics correctly', async () => {
			// Arrange
			const mockTasks = [
				{
					id: 'task-1',
					description: 'Task 1',
					status: 'in_progress',
					priority: 'high',
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					assignedTo: null,
				},
				{
					id: 'task-2',
					description: 'Task 2',
					status: 'in_progress',
					priority: 'high',
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					assignedTo: null,
				},
				{
					id: 'task-3',
					description: 'Task 3',
					status: 'review',
					priority: 'medium',
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					assignedTo: null,
				},
			];
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockTasks,
			});

			// Act
			const result = await service.getTasksData();

			// Assert
			expect(result.summary).toEqual({
				total: 3,
				byStatus: {
					in_progress: 2,
					review: 1,
				},
				byPriority: {
					high: 2,
					medium: 1,
				},
			});
		});
	});
});
