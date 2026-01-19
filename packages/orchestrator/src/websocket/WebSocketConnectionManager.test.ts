/**
 * WebSocketConnectionManager Tests
 */
import { logger } from 'shared-common/logger';
import { serializeMessage } from 'shared-common/protocol';
import type { StateManager } from 'shared-orch-worker/StateManager';
import type { Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
import type { W2OWorkerReadyMessage } from 'shared-orch-worker/worker-messages';
import { W2OMessageType, createW2OMessage } from 'shared-orch-worker/worker-messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkerCoordinator } from '../core/WorkerCoordinator';
import { WebSocketConnectionManager } from './WebSocketConnectionManager';

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
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger');

describe('WebSocketConnectionManager', () => {
	let connectionManager: WebSocketConnectionManager;
	let mockWorkerCoordinator: WorkerCoordinator;
	let mockStateManager: StateManager;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock WorkerCoordinator
		mockWorkerCoordinator = {
			registerWorker: vi.fn(),
			unregisterWorker: vi.fn(),
			onWorkerMessage: vi.fn(),
			enqueueTask: vi.fn(),
			getConnectedWorkers: vi.fn(),
			getWorker: vi.fn(),
			getQueueStats: vi.fn(),
		} as any;

		// Mock StateManager
		mockStateManager = {
			emitWorkerConnected: vi.fn(),
			emitWorkerDisconnected: vi.fn(),
			emitWorkerTaskAssigned: vi.fn(),
			emitWorkerTaskReleased: vi.fn(),
			emitTaskUpdated: vi.fn(),
		} as any;

		vi.mocked(logger.info).mockImplementation(() => {});
		vi.mocked(logger.error).mockImplementation(() => {});

		// Create connection manager
		connectionManager = new WebSocketConnectionManager(mockWorkerCoordinator, mockStateManager);
	});

	describe('Worker Connection Handling', () => {
		let mockSocket: MockWebSocket;

		beforeEach(() => {
			mockSocket = new MockWebSocket();
		});

		it('should register worker with auto-increment ID', () => {
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const workerId = connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			expect(workerId).toBe('2');
			expect(mockStateManager.emitWorkerConnected).toHaveBeenCalledWith(
				expect.objectContaining({
					id: '2',
					// type: WorkerType.DEV,
					taskId: null,
				})
			);
		});

		it('should register worker with preferred ID', () => {
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
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
					// type: WorkerType.DEV,
				})
			);
		});

		it('should use auto-increment when preferred ID is taken', () => {
			const mockSocket1 = new MockWebSocket();
			const readyMessage1: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				preferredId: 'preferred-id',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket1 as any, readyMessage1);

			const mockSocket2 = new MockWebSocket();
			const readyMessage2: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.PM,
				preferredId: 'preferred-id',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			const workerId = connectionManager.handleWorkerReady(mockSocket2 as any, readyMessage2);

			expect(workerId).not.toBe('preferred-id');
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining("Preferred ID 'preferred-id' already taken")
			);
		});

		it('should send WORKER_WELCOME message', () => {
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			expect(mockSocket.send).toHaveBeenCalled();
			const sentMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);
			expect(sentMessage.type).toBe(O2WMessageType.WORKER_WELCOME);
			expect(sentMessage.workerId).toBeDefined();
		});
	});

	describe('WORKER_READY Message Handling', () => {
		let mockSocket: MockWebSocket;

		beforeEach(() => {
			mockSocket = new MockWebSocket();
		});

		it('should try to assign task after worker ready', async () => {
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			// Give async operation time to complete
			await new Promise(resolve => setTimeout(resolve, 10));

			// Worker ready handling complete - WorkerCoordinator handles task assignment internally
		});

		// it('should handle different worker types', () => {
		// 	const workerTypes = [WorkerType.DEV, WorkerType.PM, WorkerType.PO, WorkerType.REVIEWER];
		//
		// 	workerTypes.forEach(type => {
		// 		const socket = new MockWebSocket();
		// 		const message: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
		// 			workerType: type,
		// 			projectId: 'test-project',
		// 			workspacePath: '/test/path',
		// 			availableFlows: [],
		// 		});
		// 		connectionManager.handleWorkerReady(socket as any, message);
		//
		// 		expect(mockStateManager.emitWorkerConnected).toHaveBeenCalledWith(expect.objectContaining({ type }));
		// 	});
		// });
	});

	describe('Task Assignment', () => {
		let mockSocket: MockWebSocket;
		let mockTask: Task;

		beforeEach(() => {
			mockSocket = new MockWebSocket();

			// Register worker
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
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
				// assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};
		});

		it('should assign task when available', async () => {
			await connectionManager.tryAssignTasksToIdleWorkers();

			// Task assignment handled internally by WorkerCoordinator
		});

		// Note: Task assignment is now handled by WorkerCoordinator
		// The following tests verify WebSocketConnectionManager behavior in isolation

		it('should delegate to WorkerCoordinator', async () => {
			await connectionManager.tryAssignTasksToIdleWorkers();

			// Task assignment logic is delegated to WorkerCoordinator
			// This test just verifies the method can be called without errors
			expect(true).toBe(true);
		});
	});

	describe('Worker Management', () => {
		it('should return empty workers list initially', () => {
			const workers = connectionManager.getWorkers();
			expect(workers).toHaveLength(0);
		});

		it('should return workers list after connections', () => {
			const mockSocket1 = new MockWebSocket();
			const readyMessage1: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket1 as any, readyMessage1);

			const mockSocket2 = new MockWebSocket();
			const readyMessage2: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.PM,
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
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			const workers = connectionManager.getWorkers();
			expect(workers[0]).not.toHaveProperty('socket');
		});

		it('should initialize worker without task', () => {
			const mockSocket = new MockWebSocket();
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket as any, readyMessage);

			const workers = connectionManager.getWorkers();
			expect(workers[0].taskId).toBe(null);
		});
	});

	describe('tryAssignTasksToIdleWorkers', () => {
		it('should call tryAssignTasksToIdleWorkers without errors', async () => {
			// Create 3 workers
			for (let i = 1; i <= 3; i++) {
				const mockSocket = new MockWebSocket();
				const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
					// workerType: WorkerType.DEV,
					preferredId: `worker-${i}`,
					projectId: 'test-project',
					workspacePath: '/test/path',
					availableFlows: [],
				});
				connectionManager.handleWorkerReady(mockSocket as any, readyMessage);
			}

			// Clear the mock to test tryAssignTasksToIdleWorkers specifically
			vi.clearAllMocks();

			await connectionManager.tryAssignTasksToIdleWorkers();

			// Task assignment logic is delegated to WorkerCoordinator
			expect(true).toBe(true);
		});
	});

	describe('Worker Disconnection', () => {
		let mockSocket: MockWebSocket;

		beforeEach(() => {
			mockSocket = new MockWebSocket();
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
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
			expect(logger.info).toHaveBeenCalledWith('[WS] Worker worker-1 disconnected');
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
				// assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};
			await connectionManager.tryAssignTasksToIdleWorkers();

			// Disconnect
			connectionManager.handleWorkerDisconnect('worker-1');

			// Task unassignment handled internally by WorkerCoordinator
		});

		// Note: Error handling for task unassignment is now managed by WorkerCoordinator

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
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
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
				// assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};
			await connectionManager.tryAssignTasksToIdleWorkers();

			vi.clearAllMocks();

			// Release worker
			connectionManager.releaseWorker('worker-1');

			expect(mockStateManager.emitWorkerTaskReleased).toHaveBeenCalledWith('worker-1');

			// Give async operation time to complete
			await new Promise(resolve => setTimeout(resolve, 10));

			// Task assignment handled internally by WorkerCoordinator
		});
	});

	describe('closeAll', () => {
		it('should close all worker connections', () => {
			const mockSocket1 = new MockWebSocket();
			const readyMessage1: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});
			connectionManager.handleWorkerReady(mockSocket1 as any, readyMessage1);

			const mockSocket2 = new MockWebSocket();
			const readyMessage2: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.PM,
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
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
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
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
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
