/**
 * ===========================================================================================
 * REMOTE ADAPTER - UNIT TESTS
 * ===========================================================================================
 *
 * Comprehensive tests for RemoteOrchestratorAdapter.
 *
 * Test Coverage:
 * - Initialization and connection lifecycle
 * - All 7 B→O request methods (createTask, getTask, getTasks, getWorkers, getStats, updateConfig, renameWorker)
 * - Error handling (transport errors, response errors)
 * - Event subscription (on/off)
 * - Event routing from transport to local handlers
 * - Request ID generation
 * - Transport disconnection and cleanup
 *
 * ===========================================================================================
 */
import { EventEmitter } from 'events';
import { TaskStatus } from 'shared-common/types.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { B2ORequest, B2OResponse, O2BEvent } from '@app/shared-orch-backend';
import type { Task, WorkerInfo } from '@app/shared-orch-backend';

import type { OrchestratorTransport, TransportEventHandler } from '../transport/OrchestratorTransport.js';
import { TransportFactory } from '../transport/TransportFactory.js';
import { RemoteOrchestratorAdapter } from './RemoteAdapter.js';

// ===========================================================================================
// MOCK TRANSPORT
// ===========================================================================================

/**
 * Create a mock transport for testing
 */
function createMockTransport(): OrchestratorTransport {
	let eventHandler: TransportEventHandler | null = null;
	const subscribedEvents = new Set<string>();

	return {
		request: vi.fn().mockResolvedValue({
			id: 'req-123',
			result: null,
		}),
		subscribe: vi.fn((eventType: string) => {
			subscribedEvents.add(eventType);
		}),
		unsubscribe: vi.fn((eventType: string) => {
			subscribedEvents.delete(eventType);
		}),
		onEvent: vi.fn((handler: TransportEventHandler) => {
			eventHandler = handler;
		}),
		offEvent: vi.fn(() => {
			eventHandler = null;
		}),
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		isConnected: vi.fn().mockReturnValue(true),
		// Helper to emit events for testing
		_emitEvent: (event: O2BEvent) => {
			if (eventHandler) {
				eventHandler(event);
			}
		},
		_getSubscribedEvents: () => subscribedEvents,
	} as any;
}

describe('RemoteOrchestratorAdapter', () => {
	let mockTransport: ReturnType<typeof createMockTransport>;
	let adapter: RemoteOrchestratorAdapter;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock transport
		mockTransport = createMockTransport();

		// Mock TransportFactory to return our mock transport
		vi.spyOn(TransportFactory, 'create').mockResolvedValue(mockTransport);

		// Create adapter
		adapter = new RemoteOrchestratorAdapter({
			url: 'http://localhost:3737',
			transportMode: 'websocket',
			connectionTimeout: 5000,
		});
	});

	afterEach(async () => {
		// Cleanup
		if (mockTransport) {
			await adapter.disconnect();
		}
		vi.restoreAllMocks();
	});

	// ===========================================================================================
	// LIFECYCLE TESTS
	// ===========================================================================================

	describe('connect', () => {
		test('should create transport and connect', async () => {
			// Act
			await adapter.connect();

			// Assert
			expect(TransportFactory.create).toHaveBeenCalledWith({
				url: 'http://localhost:3737',
				mode: 'websocket',
				connectionTimeout: 5000,
			});
			expect(mockTransport.onEvent).toHaveBeenCalledWith(expect.any(Function));
		});

		test('should not reconnect if already connected', async () => {
			// Act
			await adapter.connect();
			await adapter.connect();

			// Assert
			expect(TransportFactory.create).toHaveBeenCalledTimes(1);
		});

		test('should use default transport mode when not specified', async () => {
			// Arrange
			const adapterWithDefaults = new RemoteOrchestratorAdapter({
				url: 'http://localhost:3737',
			});

			// Act
			await adapterWithDefaults.connect();

			// Assert
			expect(TransportFactory.create).toHaveBeenCalledWith({
				url: 'http://localhost:3737',
				mode: 'auto',
				connectionTimeout: undefined,
			});
		});
	});

	describe('disconnect', () => {
		test('should disconnect transport and cleanup', async () => {
			// Arrange
			await adapter.connect();

			// Act
			await adapter.disconnect();

			// Assert
			expect(mockTransport.disconnect).toHaveBeenCalled();
		});

		test('should not throw if disconnecting when not connected', async () => {
			// Act & Assert
			await expect(adapter.disconnect()).resolves.not.toThrow();
		});

		test('should remove all event listeners on disconnect', async () => {
			// Arrange
			await adapter.connect();
			const handler = vi.fn();
			adapter.on('task.created', handler);

			// Act
			await adapter.disconnect();

			// Emit event after disconnect (should not be received)
			mockTransport._emitEvent({
				type: 'task.created',
				data: { taskId: 'task-123' },
			});

			// Assert
			expect(handler).not.toHaveBeenCalled();
		});
	});

	// ===========================================================================================
	// B→O REQUEST METHODS
	// ===========================================================================================

	describe('createTask', () => {
		test('should send createTask request and return task', async () => {
			// Arrange
			await adapter.connect();

			const mockTask: Task = {
				id: 'task-123',
				description: 'Test task',
				status: TaskStatus.TODO,
				metadata: { priority: 'high' },
				created: new Date().toISOString(),
			};

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: mockTask,
			});

			// Act
			const result = await adapter.createTask('Test task', { priority: 'high' });

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'createTask',
					params: {
						description: 'Test task',
						metadata: { priority: 'high' },
					},
				})
			);
			expect(result).toEqual(mockTask);
		});

		test('should generate unique request IDs', async () => {
			// Arrange
			await adapter.connect();
			mockTransport.request.mockResolvedValue({ id: 'req-123', result: {} });

			// Act
			await adapter.createTask('Task 1');
			await adapter.createTask('Task 2');

			// Assert
			const calls = mockTransport.request.mock.calls;
			const id1 = (calls[0][0] as B2ORequest).id;
			const id2 = (calls[1][0] as B2ORequest).id;
			expect(id1).not.toBe(id2);
			expect(id1).toMatch(/^req-\d+-\d+$/);
			expect(id2).toMatch(/^req-\d+-\d+$/);
		});
	});

	describe('getTask', () => {
		test('should send getTask request and return task', async () => {
			// Arrange
			await adapter.connect();

			const mockTask: Task = {
				id: 'task-123',
				description: 'Existing task',
				status: TaskStatus.IN_PROGRESS,
				created: new Date().toISOString(),
			};

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: mockTask,
			});

			// Act
			const result = await adapter.getTask('task-123');

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'getTask',
					params: { taskId: 'task-123' },
				})
			);
			expect(result).toEqual(mockTask);
		});

		test('should return null when task not found', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: null,
			});

			// Act
			const result = await adapter.getTask('non-existent');

			// Assert
			expect(result).toBeNull();
		});
	});

	describe('getTasks', () => {
		test('should send getTasks request and return tasks array', async () => {
			// Arrange
			await adapter.connect();

			const mockTasks: Task[] = [
				{
					id: 'task-1',
					description: 'Task 1',
					status: TaskStatus.TODO,
					created: new Date().toISOString(),
				},
				{
					id: 'task-2',
					description: 'Task 2',
					status: TaskStatus.DONE,
					created: new Date().toISOString(),
				},
			];

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: mockTasks,
			});

			// Act
			const result = await adapter.getTasks();

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'getTasks',
					params: undefined,
				})
			);
			expect(result).toEqual(mockTasks);
		});

		test('should send getTasks request with filters', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: [],
			});

			// Act
			await adapter.getTasks({ status: TaskStatus.TODO, workerId: 'worker-1' });

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'getTasks',
					params: { status: TaskStatus.TODO, workerId: 'worker-1' },
				})
			);
		});
	});

	describe('getWorkers', () => {
		test('should send getWorkers request and return workers array', async () => {
			// Arrange
			await adapter.connect();

			const mockWorkers: WorkerInfo[] = [
				{
					workerId: 'worker-1',
					workerName: 'Worker 1',
					type: 'agent',
					status: 'idle',
					currentTask: null,
					tasksProcessed: 5,
					capabilities: ['code', 'test'],
					lastSeen: new Date().toISOString(),
				},
			];

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: mockWorkers,
			});

			// Act
			const result = await adapter.getWorkers();

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'getWorkers',
					params: undefined,
				})
			);
			expect(result).toEqual(mockWorkers);
		});

		test('should send getWorkers request with filters', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: [],
			});

			// Act
			await adapter.getWorkers({ type: 'agent', status: 'idle' });

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'getWorkers',
					params: { type: 'agent', status: 'idle' },
				})
			);
		});
	});

	describe('getStats', () => {
		test('should send getStats request and return stats', async () => {
			// Arrange
			await adapter.connect();

			const mockStats = {
				wsPort: 3738,
				tasks: { total: 10, completed: 5, pending: 5 },
				workers: 3,
			};

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: mockStats,
			});

			// Act
			const result = await adapter.getStats();

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'getStats',
					params: {},
				})
			);
			expect(result).toEqual(mockStats);
		});
	});

	describe('updateConfig', () => {
		test('should send updateConfig request', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: undefined,
			});

			// Act
			await adapter.updateConfig({ maxWorkers: 5, timeout: 30000 });

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'updateConfig',
					params: { config: { maxWorkers: 5, timeout: 30000 } },
				})
			);
		});
	});

	describe('renameWorker', () => {
		test('should send renameWorker request', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				result: undefined,
			});

			// Act
			await adapter.renameWorker('worker-1', 'New Name');

			// Assert
			expect(mockTransport.request).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'renameWorker',
					params: { workerId: 'worker-1', name: 'New Name' },
				})
			);
		});
	});

	// ===========================================================================================
	// ERROR HANDLING
	// ===========================================================================================

	describe('error handling', () => {
		test('should throw error when not connected', async () => {
			// Act & Assert
			await expect(adapter.createTask('Test')).rejects.toThrow(
				'Not connected to orchestrator. Call connect() first.'
			);
		});

		test('should throw error when transport returns error response', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockResolvedValueOnce({
				id: 'req-123',
				error: {
					code: 'TASK_NOT_FOUND',
					message: 'Task not found',
				},
			});

			// Act & Assert
			await expect(adapter.getTask('invalid-task')).rejects.toThrow('TASK_NOT_FOUND: Task not found');
		});

		test('should propagate transport request errors', async () => {
			// Arrange
			await adapter.connect();

			mockTransport.request.mockRejectedValueOnce(new Error('Network error'));

			// Act & Assert
			await expect(adapter.createTask('Test')).rejects.toThrow('Network error');
		});
	});

	// ===========================================================================================
	// EVENT SUBSCRIPTION
	// ===========================================================================================

	describe('event subscription', () => {
		test('should subscribe to event type on first listener', async () => {
			// Arrange
			await adapter.connect();
			const handler = vi.fn();

			// Act
			adapter.on('task.created', handler);

			// Assert
			expect(mockTransport.subscribe).toHaveBeenCalledWith('task.created');
		});

		test('should not subscribe twice for same event type', async () => {
			// Arrange
			await adapter.connect();
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			// Act
			adapter.on('task.created', handler1);
			adapter.on('task.created', handler2);

			// Assert
			expect(mockTransport.subscribe).toHaveBeenCalledTimes(1);
		});

		test('should route events from transport to handlers', async () => {
			// Arrange
			await adapter.connect();
			const handler = vi.fn();
			adapter.on('task.created', handler);

			// Act
			mockTransport._emitEvent({
				type: 'task.created',
				data: { taskId: 'task-123' },
			});

			// Assert
			expect(handler).toHaveBeenCalledWith({ taskId: 'task-123' });
		});

		test('should route events to multiple handlers', async () => {
			// Arrange
			await adapter.connect();
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			adapter.on('task.created', handler1);
			adapter.on('task.created', handler2);

			// Act
			mockTransport._emitEvent({
				type: 'task.created',
				data: { taskId: 'task-123' },
			});

			// Assert
			expect(handler1).toHaveBeenCalledWith({ taskId: 'task-123' });
			expect(handler2).toHaveBeenCalledWith({ taskId: 'task-123' });
		});

		test('should unsubscribe from event type when last listener removed', async () => {
			// Arrange
			await adapter.connect();
			const handler = vi.fn();
			adapter.on('task.created', handler);

			// Act
			adapter.off('task.created', handler);

			// Assert
			expect(mockTransport.unsubscribe).toHaveBeenCalledWith('task.created');
		});

		test('should not unsubscribe if other listeners remain', async () => {
			// Arrange
			await adapter.connect();
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			adapter.on('task.created', handler1);
			adapter.on('task.created', handler2);

			// Act
			adapter.off('task.created', handler1);

			// Assert
			expect(mockTransport.unsubscribe).not.toHaveBeenCalled();
		});

		test('should not receive events after unsubscribing', async () => {
			// Arrange
			await adapter.connect();
			const handler = vi.fn();
			adapter.on('task.created', handler);
			adapter.off('task.created', handler);

			// Act
			mockTransport._emitEvent({
				type: 'task.created',
				data: { taskId: 'task-123' },
			});

			// Assert
			expect(handler).not.toHaveBeenCalled();
		});

		test('should support multiple event types', async () => {
			// Arrange
			await adapter.connect();
			const taskHandler = vi.fn();
			const workerHandler = vi.fn();
			adapter.on('task.created', taskHandler);
			adapter.on('worker.status', workerHandler);

			// Act
			mockTransport._emitEvent({
				type: 'task.created',
				data: { taskId: 'task-123' },
			});
			mockTransport._emitEvent({
				type: 'worker.status',
				data: { workerId: 'worker-1', status: 'busy' },
			});

			// Assert
			expect(taskHandler).toHaveBeenCalledWith({ taskId: 'task-123' });
			expect(workerHandler).toHaveBeenCalledWith({ workerId: 'worker-1', status: 'busy' });
			expect(mockTransport.subscribe).toHaveBeenCalledWith('task.created');
			expect(mockTransport.subscribe).toHaveBeenCalledWith('worker.status');
		});
	});
});
