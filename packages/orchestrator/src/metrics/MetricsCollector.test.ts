/**
 * MetricsCollector Tests
 */
import { Logger } from 'shared-common/Logger.js';
import { StateEvent, StateManager } from 'shared-common/StateManager.js';
import { Task, TaskStatus, WorkerInfo, WorkerType } from 'shared-orch-worker/index.js';
import { setupTest } from 'test-utils/index';
import {
	createMockStateManager,
	createMockTask,
	createMockTaskManager,
	createMockWorker,
	setupTimers,
} from 'test-utils/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskManager } from '../core/TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { MetricsCollector } from './MetricsCollector.js';

// Mock dependencies
vi.mock('../core/TaskManager.js');
vi.mock('../websocket/WorkerWebSocketServer.js');
vi.mock('shared-common/StateManager.js');
vi.mock('shared-common/Logger.js');

describe('MetricsCollector', () => {
	let collector: MetricsCollector;
	let mockTaskManager: any;
	let mockWsServer: any;
	let mockStateManager: any;
	let cleanupTimers: () => void;

	const mockTasks: Task[] = [
		createMockTask({
			id: 'task-1',
			description: 'Task 1',
			status: TaskStatus.IN_PROGRESS,
			priority: 'high',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:05:00.000Z',
			assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
		}),
		createMockTask({
			id: 'task-2',
			description: 'Task 2',
			status: TaskStatus.MERGED,
			priority: 'medium',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:10:00.000Z',
		}),
		createMockTask({
			id: 'task-3',
			description: 'Task 3',
			status: TaskStatus.CANCELLED,
			priority: 'low',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:03:00.000Z',
		}),
	];

	const mockWorkers: WorkerInfo[] = [
		createMockWorker({
			id: 'worker-1',
			type: WorkerType.DEV,
			connectedAt: '2024-01-01T00:00:00.000Z',
			taskId: 'task-1',
		}),
		createMockWorker({
			id: 'worker-2',
			type: WorkerType.DEV,
			connectedAt: '2024-01-01T00:00:00.000Z',
			taskId: null,
		}),
	];

	beforeEach(() => {
		vi.clearAllMocks();
		cleanupTimers = setupTimers();

		// Mock TaskManager
		mockTaskManager = createMockTaskManager();
		mockTaskManager.getAllTasks.mockReturnValue(mockTasks);

		// Mock WorkerWebSocketServer
		mockWsServer = {
			getWorkers: vi.fn().mockReturnValue(mockWorkers),
		} as any;

		// Mock StateManager
		mockStateManager = createMockStateManager();

		// Mock Logger
		vi.mocked(Logger.logStructured).mockImplementation(() => {});

		collector = new MetricsCollector(
			mockTaskManager,
			mockWsServer,
			mockStateManager,
			5000 // 5 second interval
		);
	});

	afterEach(() => {
		cleanupTimers();
		collector.stop();
	});

	describe('start', () => {
		it('should start collecting metrics', () => {
			collector.start();

			expect(collector.isCollecting()).toBe(true);
		});

		it('should collect metrics immediately on start', () => {
			collector.start();

			expect(mockStateManager.emitMetricsUpdated).toHaveBeenCalledTimes(1);
			expect(mockStateManager.emitMetricsUpdated).toHaveBeenCalledWith(
				expect.objectContaining({
					taskThroughput: expect.any(Object),
					workerUtilization: expect.any(Object),
					averageTaskDuration: expect.any(Number),
					timestamp: expect.any(String),
				})
			);
		});

		it('should collect metrics periodically', () => {
			collector.start();

			// Initial collection
			expect(mockStateManager.emitMetricsUpdated).toHaveBeenCalledTimes(1);

			// Advance time by 5 seconds
			vi.advanceTimersByTime(5000);
			expect(mockStateManager.emitMetricsUpdated).toHaveBeenCalledTimes(2);

			// Advance time by another 5 seconds
			vi.advanceTimersByTime(5000);
			expect(mockStateManager.emitMetricsUpdated).toHaveBeenCalledTimes(3);
		});

		it('should not start if already running', () => {
			collector.start();
			const firstCallCount = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls.length;

			collector.start(); // Second start call

			expect(Logger.logStructured).toHaveBeenCalledWith(
				'warn',
				'MetricsCollector',
				expect.stringContaining('Already running')
			);

			// Should not have collected again
			expect(vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls.length).toBe(firstCallCount);
		});
	});

	describe('stop', () => {
		it('should stop collecting metrics', () => {
			collector.start();
			expect(collector.isCollecting()).toBe(true);

			collector.stop();
			expect(collector.isCollecting()).toBe(false);
		});

		it('should not collect metrics after stop', () => {
			collector.start();
			collector.stop();

			const callCountBeforeAdvance = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls.length;

			// Advance time - should not trigger collection
			vi.advanceTimersByTime(10000);

			expect(vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls.length).toBe(callCountBeforeAdvance);
		});

		it('should handle stop when not running', () => {
			expect(() => collector.stop()).not.toThrow();
		});
	});

	describe('collectAndEmit', () => {
		it('should collect correct task throughput metrics', () => {
			collector.collectAndEmit();

			const emittedMetrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];

			expect(emittedMetrics.taskThroughput).toEqual({
				total: 3,
				completed: 1, // MERGED
				failed: 1, // CANCELLED
				inProgress: 1, // IN_PROGRESS
			});
		});

		it('should collect correct worker utilization metrics', () => {
			collector.collectAndEmit();

			const emittedMetrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];

			expect(emittedMetrics.workerUtilization).toEqual({
				idle: 1, // worker-2
				busy: 1, // worker-1
				total: 2,
			});
		});

		it('should calculate average task duration', () => {
			collector.collectAndEmit();

			const emittedMetrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];

			// Task 2 (MERGED) took 10 minutes = 600000ms
			expect(emittedMetrics.averageTaskDuration).toBe(600000);
		});

		it('should handle zero completed tasks', () => {
			vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([
				{ ...mockTasks[0], status: TaskStatus.IN_PROGRESS },
			]);

			collector.collectAndEmit();

			const emittedMetrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];
			expect(emittedMetrics.averageTaskDuration).toBe(0);
		});

		it('should include timestamp in metrics', () => {
			collector.collectAndEmit();

			const emittedMetrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];

			expect(emittedMetrics.timestamp).toBeDefined();
			expect(emittedMetrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it('should handle collection errors gracefully', () => {
			vi.mocked(mockTaskManager.getAllTasks).mockImplementation(() => {
				throw new Error('Task manager error');
			});

			expect(() => collector.collectAndEmit()).not.toThrow();
			expect(Logger.logStructured).toHaveBeenCalledWith(
				'error',
				'MetricsCollector',
				expect.stringContaining('Failed to collect metrics')
			);
		});
	});

	describe('setCollectInterval', () => {
		it('should change collection interval', () => {
			collector.start();

			// Change interval to 10 seconds
			collector.setCollectInterval(10000);

			// Clear previous calls
			vi.clearAllMocks();

			// Advance by 5 seconds - should NOT collect (interval is now 10s)
			vi.advanceTimersByTime(5000);
			expect(mockStateManager.emitMetricsUpdated).not.toHaveBeenCalled();

			// Advance by another 5 seconds (total 10s) - should collect
			vi.advanceTimersByTime(5000);
			expect(mockStateManager.emitMetricsUpdated).toHaveBeenCalled();
		});

		it('should restart collector if running', () => {
			collector.start();
			expect(collector.isCollecting()).toBe(true);

			collector.setCollectInterval(3000);

			expect(collector.isCollecting()).toBe(true);
		});

		it('should not restart if not running', () => {
			collector.setCollectInterval(3000);

			expect(collector.isCollecting()).toBe(false);
		});
	});

	describe('isCollecting', () => {
		it('should return false initially', () => {
			expect(collector.isCollecting()).toBe(false);
		});

		it('should return true after start', () => {
			collector.start();
			expect(collector.isCollecting()).toBe(true);
		});

		it('should return false after stop', () => {
			collector.start();
			collector.stop();
			expect(collector.isCollecting()).toBe(false);
		});
	});

	describe('metrics accuracy', () => {
		it('should count APPROVED tasks as completed', () => {
			vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([{ ...mockTasks[0], status: TaskStatus.APPROVED }]);

			collector.collectAndEmit();

			const metrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];
			expect(metrics.taskThroughput.completed).toBe(1);
		});

		it('should count BLOCKED tasks as failed', () => {
			vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([{ ...mockTasks[0], status: TaskStatus.BLOCKED }]);

			collector.collectAndEmit();

			const metrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];
			expect(metrics.taskThroughput.failed).toBe(1);
		});

		it('should count TESTING and REVIEWING as in progress', () => {
			vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([
				{ ...mockTasks[0], status: TaskStatus.TESTING },
				{ ...mockTasks[1], status: TaskStatus.REVIEWING },
			]);

			collector.collectAndEmit();

			const metrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];
			expect(metrics.taskThroughput.inProgress).toBe(2);
		});

		it('should calculate average duration across multiple completed tasks', () => {
			vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([
				{
					...mockTasks[0],
					status: TaskStatus.MERGED,
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-01T00:10:00.000Z', // 10 minutes
				},
				{
					...mockTasks[1],
					status: TaskStatus.APPROVED,
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-01T00:20:00.000Z', // 20 minutes
				},
			]);

			collector.collectAndEmit();

			const metrics = vi.mocked(mockStateManager.emitMetricsUpdated).mock.calls[0][0];
			// Average: (10 + 20) / 2 = 15 minutes = 900000ms
			expect(metrics.averageTaskDuration).toBe(900000);
		});
	});
});
