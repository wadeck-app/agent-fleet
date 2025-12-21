/**
 * WebSocketConnectionManager Tests
 */
import { Logger } from 'shared-common/Logger.js';
import { StateManager } from 'shared-common/StateManager.js';
import { createMessage, serializeMessage } from 'shared-common/protocol.js';
import { MessageType, Task, TaskStatus, WorkerReadyMessage, WorkerType } from 'shared-common/types.js';
import { setupTest } from 'test-utils/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskManager } from '../core/TaskManager.js';
import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';

// Mock WebSocket class
class MockWebSocket {
	public readyState = 1; // OPEN
	public listeners: Map<string, Function[]> = new Map();

	on(event: string, handler: Function) {
		const handlers = this.listeners.get(event) || [];
		handlers.push(handler);
		this.listeners.set(event, handlers);
		return this;
	}

	send = vi.fn();
	close = vi.fn();

	// Helper to trigger events
	emit(event: string, ...args: any[]) {
		const handlers = this.listeners.get(event) || [];
		handlers.forEach(handler => handler(...args));
	}
}

// Mock dependencies
vi.mock('./TaskManager.js');
vi.mock('shared-common/StateManager.js');
vi.mock('shared-common/Logger.js');

describe('WebSocketConnectionManager', () => {
	let connectionManager: WebSocketConnectionManager;
	let mockTaskManager: TaskManager;
	let mockStateManager: StateManager;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock TaskManager
		mockTaskManager = {
			getNextTaskForWorker: vi.fn(),
			assignTask: vi.fn(),
			assignTaskToWorker: vi.fn(),
			unassignTask: vi.fn(),
			updateTaskStatus: vi.fn(),
			addComment: vi.fn(),
			getTask: vi.fn(),
		} as any;

		// Mock StateManager
		mockStateManager = {
			emitWorkerConnected: vi.fn(),
			emitWorkerDisconnected: vi.fn(),
			emitWorkerTaskAssigned: vi.fn(),
			emitWorkerTaskReleased: vi.fn(),
			emitTaskUpdated: vi.fn(),
		} as any;

		vi.mocked(Logger.log).mockImplementation(() => {});
		vi.mocked(Logger.error).mockImplementation(() => {});

		// Create connection manager
		connectionManager = new WebSocketConnectionManager(mockTaskManager, mockStateManager);
	});

	describe('Worker Connection Handling', () => {
		let mockSocket: MockWebSocket;

		beforeEach(() => {
			mockSocket = new MockWebSocket();
		});

		it('should register worker with auto-increment ID', () => {
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const workerId = connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			expect(workerId).toBe('2');
			expect(mockStateManager.emitWorkerConnected).toHaveBeenCalledWith(
				expect.objectContaining({
					id: '2',
					type: WorkerType.DEV,
					taskId: null,
				})
			);
		});

		it('should register worker with preferred ID', () => {
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'preferred-worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const workerId = connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			expect(workerId).toBe('preferred-worker-1');
			expect(mockStateManager.emitWorkerConnected).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'preferred-worker-1',
					type: WorkerType.DEV,
				})
			);
		});

		it('should use auto-increment when preferred ID is taken', () => {
			const mockSocket1 = new MockWebSocket();
			const readyMessage1: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'preferred-id',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket1 as any, readyMessage1);

			const mockSocket2 = new MockWebSocket();
			const readyMessage2: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.PM,
				preferredId: 'preferred-id',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			const workerId = connectionManager.handleWorkerReady(mockSocket2 as any, readyMessage2);

			expect(workerId).not.toBe('preferred-id');
			expect(Logger.log).toHaveBeenCalledWith(
				expect.stringContaining("Preferred ID 'preferred-id' already taken")
			);
		});

		it('should send WORKER_WELCOME message', () => {
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			expect(mockSocket.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.WORKER_WELCOME);
			expect(sentMessage.workerId).toBeDefined();
		});
	});

	describe('WORKER_READY Message Handling', () => {
		let mockSocket: MockWebSocket;

		beforeEach(() => {
			mockSocket = new MockWebSocket();
		});

		it('should try to assign task after worker ready', async () => {
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(null);

			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			// Give async operation time to complete
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockTaskManager.assignTaskToWorker).toHaveBeenCalledWith(expect.anything(), WorkerType.DEV);
		});

		it('should handle different worker types', () => {
			const workerTypes = [WorkerType.DEV, WorkerType.PM, WorkerType.PO, WorkerType.REVIEWER];

			workerTypes.forEach(type => {
				const socket = new MockWebSocket();
				const message: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
					workerType: type,
					projectId: 'test-project',
					workspacePath: '/test/path',
					availableFlows: [],
				});
				connectionManager.handleWorkerReady(socket as any, message);

				expect(mockStateManager.emitWorkerConnected).toHaveBeenCalledWith(expect.objectContaining({ type }));
			});
		});
	});

	describe('Task Assignment', () => {
		let mockSocket: MockWebSocket;
		let mockTask: Task;

		beforeEach(() => {
			mockSocket = new MockWebSocket();

			// Register worker
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);
			mockSocket.send.mockClear();

			mockTask = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};
		});

		it('should assign task when available', async () => {
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);

			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(mockTaskManager.assignTaskToWorker).toHaveBeenCalledWith('worker-1', WorkerType.DEV);
		});

		it('should send ASSIGN_TASK message to worker', async () => {
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);

			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(mockSocket.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(MessageType.ASSIGN_TASK);
			expect(sentMessage.task).toEqual(mockTask);
		});

		it('should emit worker task assigned event', async () => {
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);

			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(mockStateManager.emitWorkerTaskAssigned).toHaveBeenCalledWith('worker-1', 'task-1');
		});

		it('should log task assignment', async () => {
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);

			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(Logger.log).toHaveBeenCalledWith('[WS] Assigned task task-1 to worker worker-1');
		});

		it('should handle no available task', async () => {
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(null);

			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('No task available'));
		});

		it('should not assign task to busy worker', async () => {
			// Assign first task
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			await connectionManager.tryAssignTasksToIdleWorkers();

			vi.clearAllMocks();

			// Try to assign again - worker is busy
			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(mockTaskManager.assignTaskToWorker).not.toHaveBeenCalled();
		});
	});

	describe('Worker Management', () => {
		it('should return empty workers list initially', () => {
			const workers = connectionManager.getWorkers();
			expect(workers).toHaveLength(0);
		});

		it('should return workers list after connections', () => {
			const mockSocket1 = new MockWebSocket();
			const readyMessage1: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket1 as any, readyMessage1);

			const mockSocket2 = new MockWebSocket();
			const readyMessage2: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.PM,
				preferredId: 'worker-2',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket2 as any, readyMessage2);

			const workers = connectionManager.getWorkers();
			expect(workers).toHaveLength(2);
			expect(workers.find(w => w.id === 'worker-1')).toBeDefined();
			expect(workers.find(w => w.id === 'worker-2')).toBeDefined();
		});

		it('should not include socket in workers list', () => {
			const mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			const workers = connectionManager.getWorkers();
			expect(workers[0]).not.toHaveProperty('socket');
		});

		it('should track worker task assignment', async () => {
			const mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			await connectionManager.tryAssignTasksToIdleWorkers();

			const workers = connectionManager.getWorkers();
			expect(workers[0].taskId).toBe('task-1');
		});
	});

	describe('tryAssignTasksToIdleWorkers', () => {
		it('should assign tasks to all idle workers', async () => {
			// Create 3 workers
			for (let i = 1; i <= 3; i++) {
				const mockSocket = new MockWebSocket();
				const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
					workerType: WorkerType.DEV,
					preferredId: `worker-${i}`,
					projectId: 'test-project',
					workspacePath: '/test/path',
					availableFlows: [],
				});
				connectionManager.handleWorkerReady(mockSocket as any, readyMessage);
			}

			// Clear the mock to test tryAssignTasksToIdleWorkers specifically
			vi.clearAllMocks();

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);

			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(mockTaskManager.assignTaskToWorker).toHaveBeenCalledTimes(3);
		});

		it('should not assign tasks to busy workers', async () => {
			// Create worker and assign task
			const mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			await connectionManager.tryAssignTasksToIdleWorkers();

			vi.clearAllMocks();

			// Try to assign again
			await connectionManager.tryAssignTasksToIdleWorkers();

			expect(mockTaskManager.assignTaskToWorker).not.toHaveBeenCalled();
		});
	});

	describe('Worker Disconnection', () => {
		let mockSocket: MockWebSocket;

		beforeEach(() => {
			mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);
		});

		it('should handle worker disconnect without active task', () => {
			connectionManager.handleWorkerDisconnect('worker-1');

			expect(mockStateManager.emitWorkerDisconnected).toHaveBeenCalledWith('worker-1');
			expect(Logger.log).toHaveBeenCalledWith('[WS] Worker worker-1 disconnected');
		});

		it('should unassign task on worker disconnect with active task', async () => {
			// Simulate worker having a task
			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			await connectionManager.tryAssignTasksToIdleWorkers();

			// Disconnect
			connectionManager.handleWorkerDisconnect('worker-1');

			expect(mockTaskManager.unassignTask).toHaveBeenCalledWith('task-1');
		});

		it('should handle unassign task error on disconnect', async () => {
			// Simulate worker having a task
			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			await connectionManager.tryAssignTasksToIdleWorkers();

			vi.mocked(mockTaskManager.unassignTask).mockImplementation(() => {
				throw new Error('Unassign failed');
			});

			connectionManager.handleWorkerDisconnect('worker-1');

			expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Error unassigning task'));
		});

		it('should remove worker from workers list on disconnect', () => {
			const workersBefore = connectionManager.getWorkers();
			expect(workersBefore).toHaveLength(1);

			connectionManager.handleWorkerDisconnect('worker-1');

			const workersAfter = connectionManager.getWorkers();
			expect(workersAfter).toHaveLength(0);
		});
	});

	describe('releaseWorker', () => {
		it('should release worker and try to assign new task', async () => {
			const mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			// Assign a task
			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				comments: [],
				metadata: {},
				history: [],
			};
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			await connectionManager.tryAssignTasksToIdleWorkers();

			vi.clearAllMocks();
			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(null);

			// Release worker
			connectionManager.releaseWorker('worker-1');

			expect(mockStateManager.emitWorkerTaskReleased).toHaveBeenCalledWith('worker-1');

			// Give async operation time to complete
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockTaskManager.assignTaskToWorker).toHaveBeenCalledWith('worker-1', WorkerType.DEV);
		});
	});

	describe('closeAll', () => {
		it('should close all worker connections', () => {
			const mockSocket1 = new MockWebSocket();
			const readyMessage1: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket1 as any, readyMessage1);

			const mockSocket2 = new MockWebSocket();
			const readyMessage2: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.PM,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket2 as any, readyMessage2);

			connectionManager.closeAll();

			expect(mockSocket1.close).toHaveBeenCalled();
			expect(mockSocket2.close).toHaveBeenCalled();
		});

		it('should clear workers list', () => {
			const mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			expect(connectionManager.getWorkers()).toHaveLength(1);

			connectionManager.closeAll();

			expect(connectionManager.getWorkers()).toHaveLength(0);
		});
	});

	describe('getWorker', () => {
		it('should return worker by ID', () => {
			const mockSocket = new MockWebSocket();
			const readyMessage: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
				workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			const worker = connectionManager.getWorker('worker-1');

			expect(worker).toBeDefined();
			expect(worker?.id).toBe('worker-1');
		});

		it('should return undefined for non-existent worker', () => {
			const worker = connectionManager.getWorker('non-existent');

			expect(worker).toBeUndefined();
		});
	});
});
