/**
 * Intervention Flow Integration Tests
 * Tests the complete intervention flow from worker request to user response
 */
import { logger } from 'shared-common/logger';
import { serializeMessage } from 'shared-common/protocol';
import type { StateManager } from 'shared-orch-worker/StateManager';
import type { Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
import type { W2OInterventionRequestedMessage, W2OWorkerReadyMessage } from 'shared-orch-worker/worker-messages';
import { W2OMessageType, createW2OMessage } from 'shared-orch-worker/worker-messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InterventionManager } from '../core/InterventionManager';
import type { WorkerCoordinator } from '../core/WorkerCoordinator';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer';

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

// Store the latest WSS instance globally
let latestWssInstance: any = null;

// Mock the ws module
vi.mock('ws', () => {
	return {
		WebSocketServer: function (this: any, config: any) {
			this.config = config;
			this.listeners = new Map<string, Function[]>();

			this.on = function (event: string, handler: Function) {
				const handlers = this.listeners.get(event) || [];
				handlers.push(handler);
				this.listeners.set(event, handlers);
				return this;
			};

			this.close = vi.fn((callback: Function) => {
				if (callback) callback();
			});

			// Helper to trigger events
			this.emit = function (event: string, ...args: any[]) {
				const handlers = this.listeners.get(event) || [];
				handlers.forEach((handler: Function) => handler(...args));
			};

			latestWssInstance = this;
			return this;
		},
		WebSocket: { OPEN: 1 },
	};
});

// Mock dependencies
vi.mock('./TaskManager');
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger');

describe('Intervention Flow Integration', () => {
	let server: WorkerWebSocketServer;
	let mockWorkerCoordinator: WorkerCoordinator;
	let mockTaskManager: any;
	let mockStateManager: StateManager;
	let interventionManager: InterventionManager;
	let mockWss: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock TaskManager (still needed for InterventionManager)
		mockTaskManager = {
			getNextTaskForWorker: vi.fn(),
			assignTask: vi.fn(),
			assignTaskToWorker: vi.fn(),
			unassignTask: vi.fn(),
			updateTaskStatus: vi.fn(),
			addComment: vi.fn(),
			getTask: vi.fn(),
			setTaskIntervention: vi.fn(),
			clearTaskIntervention: vi.fn(),
		} as any;

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
			emit: vi.fn(),
		} as any;

		vi.mocked(logger.info).mockImplementation(() => {});
		vi.mocked(logger.error).mockImplementation(() => {});

		// Create real InterventionManager (still uses TaskManager for now)
		interventionManager = new InterventionManager(mockTaskManager);

		// Create server
		server = new WorkerWebSocketServer(mockWorkerCoordinator, mockStateManager, interventionManager, 3738);
		mockWss = latestWssInstance;

		// Wire up callback
		interventionManager.setSendResponseCallback((taskId, interventionId, response, timedOut, cancelled) => {
			return server.sendInterventionResponse(taskId, interventionId, response, timedOut, cancelled);
		});
	});

	describe('Blocking Intervention Flow', () => {
		it('should handle complete blocking intervention flow', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			// Register worker
			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.TODO,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));

			// Wait for worker registration
			await new Promise(resolve => setTimeout(resolve, 10));

			vi.clearAllMocks();

			// Step 1: Worker sends INTERVENTION_REQUESTED
			const interventionRequest: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-1',
					flowId: 'flow-1',
					stepId: 'step-1',
					interventionType: 'approval',
					blocking: true,
					config: {
						title: 'Approve deployment',
						description: 'Deploy to production?',
						allowReject: true,
					},
					timeout: {
						minutes: 5,
						onTimeout: 'fail',
					},
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(interventionRequest)));

			// Wait for intervention creation
			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify intervention was created
			expect(mockTaskManager.setTaskIntervention).toHaveBeenCalledWith('task-1', expect.any(String));

			// Verify task status changed to AWAITING_USER
			const interventions = interventionManager.getPendingInterventionsFromMemory();
			expect(interventions).toHaveLength(1);
			expect(interventions[0].type).toBe('approval');
			expect(interventions[0].status).toBe('pending');
			expect(interventions[0].blocking).toBe(true);

			const interventionId = interventions[0].id;

			// Step 2: User responds to intervention
			await interventionManager.respondToIntervention(interventionId, {
				value: true,
				answeredBy: 'user-123',
				comment: 'LGTM',
			});

			// Verify response was sent to worker
			expect(mockSocket.send).toHaveBeenCalled();
			const sentMessages = mockSocket.send.mock.calls.map(call => JSON.parse(call[0]));
			const responseMessage = sentMessages.find(msg => msg.type === O2WMessageType.INTERVENTION_RESPONSE);

			expect(responseMessage).toBeDefined();
			expect(responseMessage.taskId).toBe('task-1');
			expect(responseMessage.interventionId).toBe(interventionId);
			expect(responseMessage.response.value).toBe(true);
			expect(responseMessage.response.answeredBy).toBe('user-123');
			expect(responseMessage.response.comment).toBe('LGTM');
			expect(responseMessage.timedOut).toBe(false);
			expect(responseMessage.cancelled).toBe(false);

			// Verify task intervention was cleared
			expect(mockTaskManager.clearTaskIntervention).toHaveBeenCalledWith('task-1', interventionId);

			// Verify intervention is no longer pending
			const pendingAfter = interventionManager.getPendingInterventionsFromMemory();
			expect(pendingAfter).toHaveLength(0);
		});

		it('should handle rejection in approval intervention', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));
			await new Promise(resolve => setTimeout(resolve, 10));
			vi.clearAllMocks();

			// Send intervention request
			const interventionRequest: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-2',
					stepId: 'step-approval',
					interventionType: 'approval',
					blocking: true,
					config: {
						title: 'Approve changes',
						allowReject: true,
					},
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(interventionRequest)));
			await new Promise(resolve => setTimeout(resolve, 10));

			const interventions = interventionManager.getPendingInterventionsFromMemory();
			const interventionId = interventions[0].id;

			// User rejects
			await interventionManager.respondToIntervention(interventionId, {
				value: false,
				answeredBy: 'user-123',
				comment: 'Not ready yet',
			});

			// Verify rejection was sent
			const sentMessages = mockSocket.send.mock.calls.map(call => JSON.parse(call[0]));
			const responseMessage = sentMessages.find(msg => msg.type === O2WMessageType.INTERVENTION_RESPONSE);

			expect(responseMessage.response.value).toBe(false);
			expect(responseMessage.response.comment).toBe('Not ready yet');
		});
	});

	describe('Non-Blocking Intervention Flow', () => {
		it('should send immediate response for non-blocking interventions', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));
			await new Promise(resolve => setTimeout(resolve, 10));
			vi.clearAllMocks();

			// Send non-blocking intervention request
			const interventionRequest: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-3',
					stepId: 'step-question',
					interventionType: 'question',
					blocking: false, // Non-blocking
					config: {
						title: 'Optional feedback',
						question: 'Any suggestions?',
						responseType: 'text',
					},
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(interventionRequest)));
			await new Promise(resolve => setTimeout(resolve, 10));

			// Should receive immediate response with null
			const sentMessages = mockSocket.send.mock.calls.map(call => JSON.parse(call[0]));
			const responseMessage = sentMessages.find(msg => msg.type === O2WMessageType.INTERVENTION_RESPONSE);

			expect(responseMessage).toBeDefined();
			expect(responseMessage.response).toBeNull();
			expect(responseMessage.timedOut).toBeFalsy();
			expect(responseMessage.cancelled).toBeFalsy();

			// Intervention should still be tracked
			const interventions = interventionManager.getPendingInterventionsFromMemory();
			expect(interventions).toHaveLength(1);
		});
	});

	describe('Timeout Handling', () => {
		it('should handle intervention timeout with fail strategy', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));
			await new Promise(resolve => setTimeout(resolve, 10));
			vi.clearAllMocks();

			// Send intervention with short timeout
			const interventionRequest: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-4',
					stepId: 'step-timeout',
					interventionType: 'approval',
					blocking: true,
					config: {
						title: 'Quick approval needed',
					},
					timeout: {
						minutes: 0.01, // 600ms
						onTimeout: 'fail',
					},
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(interventionRequest)));
			await new Promise(resolve => setTimeout(resolve, 10));

			const interventions = interventionManager.getPendingInterventionsFromMemory();
			expect(interventions).toHaveLength(1);

			// Wait for timeout
			await new Promise(resolve => setTimeout(resolve, 700));

			// Verify timeout response was sent
			const sentMessages = mockSocket.send.mock.calls.map(call => JSON.parse(call[0]));
			const responseMessage = sentMessages.find(msg => msg.type === O2WMessageType.INTERVENTION_RESPONSE);

			expect(responseMessage).toBeDefined();
			expect(responseMessage.timedOut).toBe(true);
			expect(responseMessage.response).toBeNull(); // fail strategy means no response

			// Intervention should be removed from pending
			const pendingAfter = interventionManager.getPendingInterventionsFromMemory();
			expect(pendingAfter).toHaveLength(0);
		});

		it('should handle intervention timeout with default value strategy', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));
			await new Promise(resolve => setTimeout(resolve, 10));
			vi.clearAllMocks();

			// Send intervention with default value timeout
			const interventionRequest: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-5',
					stepId: 'step-default',
					interventionType: 'choice',
					blocking: true,
					config: {
						title: 'Choose environment',
						options: [
							{ id: 'dev', label: 'Development' },
							{ id: 'prod', label: 'Production' },
						],
					},
					timeout: {
						minutes: 0.01, // 600ms
						onTimeout: 'default',
						defaultValue: 'dev',
					},
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(interventionRequest)));
			await new Promise(resolve => setTimeout(resolve, 10));

			// Wait for timeout
			await new Promise(resolve => setTimeout(resolve, 700));

			// Verify default value was used
			const sentMessages = mockSocket.send.mock.calls.map(call => JSON.parse(call[0]));
			const responseMessage = sentMessages.find(msg => msg.type === O2WMessageType.INTERVENTION_RESPONSE);

			expect(responseMessage).toBeDefined();
			expect(responseMessage.timedOut).toBe(true);
			expect(responseMessage.response.value).toBe('dev');
			expect(responseMessage.response.answeredBy).toBe('system');
		});
	});

	describe('Cancellation', () => {
		it('should handle intervention cancellation', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));
			await new Promise(resolve => setTimeout(resolve, 10));
			vi.clearAllMocks();

			// Create intervention
			const interventionRequest: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-6',
					stepId: 'step-cancel',
					interventionType: 'question',
					blocking: true,
					config: {
						title: 'Input needed',
						question: 'Enter value',
						responseType: 'text',
					},
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(interventionRequest)));
			await new Promise(resolve => setTimeout(resolve, 10));

			const interventions = interventionManager.getPendingInterventionsFromMemory();
			const interventionId = interventions[0].id;

			// Cancel intervention
			await interventionManager.cancelIntervention(interventionId);

			// Verify cancellation was sent
			const sentMessages = mockSocket.send.mock.calls.map(call => JSON.parse(call[0]));
			const responseMessage = sentMessages.find(msg => msg.type === O2WMessageType.INTERVENTION_RESPONSE);

			expect(responseMessage).toBeDefined();
			expect(responseMessage.cancelled).toBe(true);
			expect(responseMessage.response).toBeNull();

			// Intervention should be removed
			const pendingAfter = interventionManager.getPendingInterventionsFromMemory();
			expect(pendingAfter).toHaveLength(0);
		});
	});

	describe('Multiple Interventions', () => {
		it('should handle multiple interventions for same task', async () => {
			const mockSocket = new MockWebSocket();
			mockWss.emit('connection', mockSocket);

			const readyMessage: W2OWorkerReadyMessage = createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: 'worker-1',
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			const mockTask: Task = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: { workerId: 'worker-1' },
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.assignTaskToWorker).mockResolvedValue(mockTask);
			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

			mockSocket.emit('message', Buffer.from(serializeMessage(readyMessage)));
			await new Promise(resolve => setTimeout(resolve, 10));
			vi.clearAllMocks();

			// Create first intervention
			const intervention1: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-7',
					stepId: 'step-1',
					interventionType: 'approval',
					blocking: true,
					config: { title: 'First approval' },
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(intervention1)));
			await new Promise(resolve => setTimeout(resolve, 10));

			// Create second intervention
			const intervention2: W2OInterventionRequestedMessage = createW2OMessage(
				W2OMessageType.INTERVENTION_REQUESTED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					interventionId: 'test-intervention-8',
					stepId: 'step-2',
					interventionType: 'question',
					blocking: true,
					config: { title: 'Question', question: 'Details?', responseType: 'text' },
				}
			);

			mockSocket.emit('message', Buffer.from(serializeMessage(intervention2)));
			await new Promise(resolve => setTimeout(resolve, 10));

			// Should have both pending
			const interventions = interventionManager.getPendingInterventionsFromMemory();
			expect(interventions).toHaveLength(2);

			// Respond to first
			await interventionManager.respondToIntervention(interventions[0].id, {
				value: true,
				answeredBy: 'user-123',
			});

			// Should have one pending
			const afterFirst = interventionManager.getPendingInterventionsFromMemory();
			expect(afterFirst).toHaveLength(1);

			// Respond to second
			await interventionManager.respondToIntervention(interventions[1].id, {
				value: 'Details here',
				answeredBy: 'user-123',
			});

			// Should have none pending
			const afterSecond = interventionManager.getPendingInterventionsFromMemory();
			expect(afterSecond).toHaveLength(0);
		});
	});
});
