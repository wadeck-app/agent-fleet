import { StateManager } from 'shared-orch-worker/StateManager';
import type { Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
import { W2OMessageType } from 'shared-orch-worker/worker-messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { BackendEventBridge } from './BackendEventBridge';
import { WorkerCoordinator } from './WorkerCoordinator';

describe('WorkerCoordinator', () => {
	let coordinator: WorkerCoordinator;
	let eventBridge: BackendEventBridge;
	let stateManager: StateManager;
	let mockSocket: WebSocket;
	let backendEvents: Array<{ event: string; data: unknown }>;

	beforeEach(() => {
		// Create state manager
		stateManager = new StateManager();

		// Create event bridge and capture events
		eventBridge = new BackendEventBridge();
		backendEvents = [];
		eventBridge.registerHandler(async (event: string, data: unknown) => {
			backendEvents.push({ event, data });
		});

		// Create coordinator
		coordinator = new WorkerCoordinator(eventBridge, stateManager);

		// Create mock socket
		mockSocket = {
			send: vi.fn(),
			on: vi.fn(),
			close: vi.fn(),
		} as unknown as WebSocket;
	});

	describe('registerWorker', () => {
		it('should register a worker and mark as idle', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1', 'flow2']);

			const workers = coordinator.getConnectedWorkers();
			expect(workers).toHaveLength(1);
			expect(workers[0].workerId).toBe('worker1');
			expect(workers[0].availableFlows).toEqual(['flow1', 'flow2']);
			expect(workers[0].isIdle).toBe(true);
		});

		it('should notify backend when worker connects', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('worker_connected');
			expect(backendEvents[0].data).toMatchObject({
				workerId: 'worker1',
				capabilities: ['flow1'],
			});
		});
	});

	describe('unregisterWorker', () => {
		it('should unregister a worker', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			coordinator.unregisterWorker('worker1');

			const workers = coordinator.getConnectedWorkers();
			expect(workers).toHaveLength(0);
		});

		it('should notify backend when worker disconnects', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			backendEvents = []; // Clear registration event
			coordinator.unregisterWorker('worker1');

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('worker_disconnected');
			expect(backendEvents[0].data).toMatchObject({
				workerId: 'worker1',
			});
		});

		it('should discard tasks in worker queue when worker disconnects', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// First task will be auto-assigned and make worker busy
			const task1 = createMockTask('task1', 'worker1');
			coordinator.enqueueTask(task1);

			// Second task will stay in queue because worker is busy
			const task2 = createMockTask('task2', 'worker1');
			coordinator.enqueueTask(task2);

			const statsBefore = coordinator.getQueueStats();
			expect(statsBefore.workerQueues['worker1']).toBe(1);

			coordinator.unregisterWorker('worker1');

			const statsAfter = coordinator.getQueueStats();
			expect(statsAfter.workerQueues['worker1']).toBeUndefined();
		});
	});

	describe('enqueueTask', () => {
		it('should add task to global backlog if no assignedTo', () => {
			const task = createMockTask('task1');
			coordinator.enqueueTask(task);

			const stats = coordinator.getQueueStats();
			expect(stats.globalBacklog).toBe(1);
		});

		it('should add task to worker queue if assignedTo is set', () => {
			const task = createMockTask('task1', 'worker1');
			coordinator.enqueueTask(task);

			const stats = coordinator.getQueueStats();
			expect(stats.workerQueues['worker1']).toBe(1);
			expect(stats.globalBacklog).toBe(0);
		});

		it('should auto-assign task when idle worker is available', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			const task = createMockTask('task1');
			coordinator.enqueueTask(task);

			// Socket.send should be called with ASSIGN_TASK message
			expect(mockSocket.send).toHaveBeenCalledTimes(1);
			const sentMessage = JSON.parse((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
			expect(sentMessage.type).toBe(O2WMessageType.ASSIGN_TASK);
			expect(sentMessage.task.id).toBe('task1');

			// Worker should no longer be idle
			const workers = coordinator.getConnectedWorkers();
			expect(workers[0].isIdle).toBe(false);

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			// Backend should be notified of task assignment
			const assignmentEvent = backendEvents.find(e => e.event === 'task_assigned');
			expect(assignmentEvent).toBeDefined();
			expect(assignmentEvent?.data).toMatchObject({
				taskId: 'task1',
				workerId: 'worker1',
			});
		});
	});

	describe('onWorkerMessage - TASK_STARTED', () => {
		it('should notify backend when task starts', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			backendEvents = []; // Clear registration event

			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_STARTED,
				workerId: 'worker1',
				taskId: 'task1',
				timestamp: new Date().toISOString(),
			});

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('task_started');
			expect(backendEvents[0].data).toMatchObject({
				taskId: 'task1',
			});
		});
	});

	describe('onWorkerMessage - TASK_TRACE_UPDATE', () => {
		it('should notify backend of trace updates', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			backendEvents = []; // Clear registration event

			const trace = { step: 'step1', data: 'test' };
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_TRACE_UPDATE,
				workerId: 'worker1',
				taskId: 'task1',
				trace,
				timestamp: new Date().toISOString(),
			});

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('task_trace_update');
			expect(backendEvents[0].data).toMatchObject({
				taskId: 'task1',
				traceChunk: trace,
			});
		});
	});

	describe('onWorkerMessage - INTERVENTION_REQUESTED', () => {
		it('should notify backend when intervention is requested', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			backendEvents = []; // Clear registration event

			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.INTERVENTION_REQUESTED,
				workerId: 'worker1',
				taskId: 'task1',
				interventionId: 'int1',
				stepId: 'step1',
				interventionType: 'approval',
				blocking: true,
				config: { title: 'Approve this' },
				timestamp: new Date().toISOString(),
			});

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('intervention_requested');
			const data = backendEvents[0].data as {
				taskId: string;
				interventionData: { interventionId: string };
			};
			expect(data.taskId).toBe('task1');
			expect(data.interventionData.interventionId).toBe('int1');
		});
	});

	describe('onWorkerMessage - TASK_COMPLETED', () => {
		it('should mark worker as idle when task completes', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Assign task to make worker busy
			const task = createMockTask('task1');
			coordinator.enqueueTask(task);

			// Verify worker is busy
			let workers = coordinator.getConnectedWorkers();
			expect(workers[0].isIdle).toBe(false);

			backendEvents = []; // Clear previous events

			// Complete task
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_COMPLETED,
				workerId: 'worker1',
				taskId: 'task1',
				result: { status: 'completed' },
				timestamp: new Date().toISOString(),
			});

			// Worker should be idle again
			workers = coordinator.getConnectedWorkers();
			expect(workers[0].isIdle).toBe(true);

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			// Backend should be notified
			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('task_completed');
			expect(backendEvents[0].data).toMatchObject({
				taskId: 'task1',
			});
		});

		it('should auto-assign next task when task completes', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Enqueue two tasks
			const task1 = createMockTask('task1');
			const task2 = createMockTask('task2');
			coordinator.enqueueTask(task1);
			coordinator.enqueueTask(task2);

			// First task is auto-assigned, second stays in backlog
			expect((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

			// Complete first task
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_COMPLETED,
				workerId: 'worker1',
				taskId: 'task1',
				timestamp: new Date().toISOString(),
			});

			// Second task should be auto-assigned
			expect((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
			const sentMessage = JSON.parse((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls[1][0]);
			expect(sentMessage.type).toBe(O2WMessageType.ASSIGN_TASK);
			expect(sentMessage.task.id).toBe('task2');
		});
	});

	describe('onWorkerMessage - TASK_FAILED', () => {
		it('should mark worker as idle when task fails', async () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Assign task to make worker busy
			const task = createMockTask('task1');
			coordinator.enqueueTask(task);

			backendEvents = []; // Clear previous events

			// Fail task
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_FAILED,
				workerId: 'worker1',
				taskId: 'task1',
				error: 'Something went wrong',
				timestamp: new Date().toISOString(),
			});

			// Worker should be idle again
			const workers = coordinator.getConnectedWorkers();
			expect(workers[0].isIdle).toBe(true);

			// Wait for async event
			await new Promise(resolve => setTimeout(resolve, 10));

			// Backend should be notified
			expect(backendEvents).toHaveLength(1);
			expect(backendEvents[0].event).toBe('task_completed');
			const data = backendEvents[0].data as { taskId: string; flowResult: { status: string; error: string } };
			expect(data.taskId).toBe('task1');
			expect(data.flowResult.status).toBe('failed');
			expect(data.flowResult.error).toBe('Something went wrong');
		});
	});

	describe('onWorkerMessage - REQUEST_TASK', () => {
		it('should assign task when worker requests and task available', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Enqueue task
			const task = createMockTask('task1');
			coordinator.enqueueTask(task);

			// Task is auto-assigned immediately
			expect((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

			// Complete task to make worker idle
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_COMPLETED,
				workerId: 'worker1',
				taskId: 'task1',
				timestamp: new Date().toISOString(),
			});

			// Enqueue another task
			const task2 = createMockTask('task2');
			coordinator.enqueueTask(task2);

			// Second task is also auto-assigned
			expect((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
		});

		it('should mark worker idle when no task available', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Manually mark worker as not idle
			const task = createMockTask('task1');
			coordinator.enqueueTask(task);

			// Complete task
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_COMPLETED,
				workerId: 'worker1',
				taskId: 'task1',
				timestamp: new Date().toISOString(),
			});

			// Worker should be marked idle (no more tasks)
			const workers = coordinator.getConnectedWorkers();
			expect(workers[0].isIdle).toBe(true);
		});
	});

	describe('queue priority', () => {
		it('should prioritize worker-specific queue over global backlog', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			// Add task to global backlog
			const globalTask = createMockTask('global-task');
			coordinator.enqueueTask(globalTask);

			// Task is auto-assigned
			expect((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
			let sentMessage = JSON.parse((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
			expect(sentMessage.task.id).toBe('global-task');

			// Complete task
			coordinator.onWorkerMessage('worker1', {
				type: W2OMessageType.TASK_COMPLETED,
				workerId: 'worker1',
				taskId: 'global-task',
				timestamp: new Date().toISOString(),
			});

			// Add task to worker-specific queue
			const workerTask = createMockTask('worker-task', 'worker1');
			coordinator.enqueueTask(workerTask);

			// Add another task to global backlog
			const globalTask2 = createMockTask('global-task-2');
			coordinator.enqueueTask(globalTask2);

			// Worker-specific task should be assigned first
			expect((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
			sentMessage = JSON.parse((mockSocket.send as ReturnType<typeof vi.fn>).mock.calls[1][0]);
			expect(sentMessage.task.id).toBe('worker-task');
		});
	});

	describe('getQueueStats', () => {
		it('should return correct queue statistics', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			coordinator.registerWorker('worker2', mockSocket, ['flow2']);

			const task1 = createMockTask('task1', 'worker1');
			const task2 = createMockTask('task2', 'worker1');
			const task3 = createMockTask('task3');

			coordinator.enqueueTask(task1);
			coordinator.enqueueTask(task2);
			coordinator.enqueueTask(task3);

			const stats = coordinator.getQueueStats();

			// task1 and task2 are in worker1's queue, but task1 is auto-assigned
			// so only task2 remains in queue
			expect(stats.workerQueues['worker1']).toBe(1);
			expect(stats.globalBacklog).toBe(0); // task3 is auto-assigned to worker2
			expect(stats.idleWorkers).toBe(0); // both workers are busy
			expect(stats.connectedWorkers).toBe(2);
		});
	});

	describe('getConnectedWorkers', () => {
		it('should return list of all connected workers', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);
			coordinator.registerWorker('worker2', mockSocket, ['flow2', 'flow3']);

			const workers = coordinator.getConnectedWorkers();

			expect(workers).toHaveLength(2);
			expect(workers[0].workerId).toBe('worker1');
			expect(workers[0].availableFlows).toEqual(['flow1']);
			expect(workers[1].workerId).toBe('worker2');
			expect(workers[1].availableFlows).toEqual(['flow2', 'flow3']);
		});
	});

	describe('getWorker', () => {
		it('should return worker by ID', () => {
			coordinator.registerWorker('worker1', mockSocket, ['flow1']);

			const worker = coordinator.getWorker('worker1');

			expect(worker).toBeDefined();
			expect(worker?.workerId).toBe('worker1');
			expect(worker?.socket).toBe(mockSocket);
		});

		it('should return undefined for non-existent worker', () => {
			const worker = coordinator.getWorker('non-existent');
			expect(worker).toBeUndefined();
		});
	});
});

/**
 * Helper function to create a mock task
 */
function createMockTask(taskId: string, assignedWorkerId?: string): Task {
	return {
		id: taskId,
		description: `Test task ${taskId}`,
		status: TaskStatus.BACKLOG,
		priority: 'medium',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		assignedTo: assignedWorkerId ? { workerId: assignedWorkerId } : null,
		comments: [],
		metadata: {},
		history: [],
	};
}
