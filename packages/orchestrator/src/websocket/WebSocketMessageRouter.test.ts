/**
 * WebSocketMessageRouter Tests
 */
import { MockWebSocket } from 'orchestrator/test-utils/mocks';
import { logger } from 'shared-common/logger';
import { createMessage } from 'shared-common/protocol';
import {
	REMOVE_W2OStopRequestedMessage,
	W2OFlowStepCompletedMessage,
	W2OFlowStepFailedMessage,
	W2OFlowStepStartedMessage,
	W2OHookEventMessage,
	W2OMessageType,
	W2OTaskCompletedMessage,
	W2OTaskFailedMessage,
	W2OTaskProgressMessage,
	W2OTaskQuestionMessage,
	W2OTaskStartedMessage,
	W2OWorkerHeartbeatMessage,
	W2OWorkerReadyMessage,
	W2OWorkspaceAllocatedMessage,
	W2OWorkspaceReleasedMessage,
} from 'shared-orch-worker/worker-messages';
import { setupTest } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketConnectionManager } from './WebSocketConnectionManager';
import { WebSocketEventHandler } from './WebSocketEventHandler';
import { WebSocketMessageRouter } from './WebSocketMessageRouter';

// Mock dependencies
vi.mock('./WebSocketConnectionManager');
vi.mock('./WebSocketEventHandler');
vi.mock('shared-common/logger');

describe('WebSocketMessageRouter', () => {
	let cleanup: () => void;
	let messageRouter: WebSocketMessageRouter;
	let mockConnectionManager: WebSocketConnectionManager;
	let mockEventHandler: WebSocketEventHandler;
	let mockSocket: MockWebSocket;

	beforeEach(() => {
		cleanup = setupTest();

		mockSocket = new MockWebSocket();

		// Mock ConnectionManager
		mockConnectionManager = {
			handleWorkerReady: vi.fn(),
			sendMessage: vi.fn(),
			getWorker: vi.fn(),
			releaseWorker: vi.fn(),
		} as any;

		// Mock EventHandler
		mockEventHandler = {
			handleTaskStarted: vi.fn(),
			handleTaskProgress: vi.fn(),
			handleTaskCompleted: vi.fn(),
			handleTaskFailed: vi.fn(),
			handleTaskQuestion: vi.fn(),
			handleFlowStepStarted: vi.fn(),
			handleFlowStepCompleted: vi.fn(),
			handleFlowStepFailed: vi.fn(),
			handleWorkspaceAllocated: vi.fn(),
			handleWorkspaceReleased: vi.fn(),
			handleStopRequested: vi.fn(),
			handleHookEvent: vi.fn(),
		} as any;

		// Create message router
		messageRouter = new WebSocketMessageRouter(mockConnectionManager, mockEventHandler);
	});

	afterEach(() => {
		cleanup();
	});

	describe('Message Routing', () => {
		it('should route WORKER_READY to connection manager', () => {
			const message: W2OWorkerReadyMessage = createMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			vi.mocked(mockConnectionManager.handleWorkerReady).mockReturnValue('worker-1');

			const result = messageRouter.routeMessage(mockSocket as any, message, null);

			expect(mockConnectionManager.handleWorkerReady).toHaveBeenCalledWith(mockSocket, message);
			expect(result).toBe('worker-1');
		});

		it('should route WORKER_HEARTBEAT to connection manager', () => {
			const message: W2OWorkerHeartbeatMessage = createMessage(W2OMessageType.WORKER_HEARTBEAT, {
				workerId: 'worker-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
				mockSocket,
				expect.objectContaining({ type: W2OMessageType.ACK })
			);
		});

		it('should route TASK_STARTED to event handler', () => {
			const message: W2OTaskStartedMessage = createMessage(W2OMessageType.TASK_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleTaskStarted).toHaveBeenCalledWith(message);
		});

		it('should route TASK_PROGRESS to event handler', () => {
			const message: W2OTaskProgressMessage = createMessage(W2OMessageType.TASK_PROGRESS, {
				workerId: 'worker-1',
				taskId: 'task-1',
				progress: 'Working',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleTaskProgress).toHaveBeenCalledWith(message);
		});

		it('should route TASK_COMPLETED to event handler', () => {
			const message: W2OTaskCompletedMessage = createMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleTaskCompleted).toHaveBeenCalledWith(message);
		});

		it('should route TASK_FAILED to event handler', () => {
			const message: W2OTaskFailedMessage = createMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Error',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleTaskFailed).toHaveBeenCalledWith(message);
		});

		it('should route TASK_QUESTION to event handler', () => {
			const message: W2OTaskQuestionMessage = createMessage(W2OMessageType.TASK_QUESTION, {
				workerId: 'worker-1',
				taskId: 'task-1',
				question: 'Question?',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleTaskQuestion).toHaveBeenCalledWith(message);
		});

		it('should route FLOW_STEP_STARTED to event handler', () => {
			const message: W2OFlowStepStartedMessage = createMessage(W2OMessageType.FLOW_STEP_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleFlowStepStarted).toHaveBeenCalledWith(message);
		});

		it('should route FLOW_STEP_COMPLETED to event handler', () => {
			const message: W2OFlowStepCompletedMessage = createMessage(W2OMessageType.FLOW_STEP_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleFlowStepCompleted).toHaveBeenCalledWith(message);
		});

		it('should route FLOW_STEP_FAILED to event handler', () => {
			const message: W2OFlowStepFailedMessage = createMessage(W2OMessageType.FLOW_STEP_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
				error: 'Error',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleFlowStepFailed).toHaveBeenCalledWith(message);
		});

		it('should route WORKSPACE_ALLOCATED to event handler', () => {
			const message: W2OWorkspaceAllocatedMessage = createMessage(W2OMessageType.WORKSPACE_ALLOCATED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				workspaceId: 'ws-1',
				workspacePath: '/path',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleWorkspaceAllocated).toHaveBeenCalledWith(message);
		});

		it('should route WORKSPACE_RELEASED to event handler', () => {
			const message: W2OWorkspaceReleasedMessage = createMessage(W2OMessageType.WORKSPACE_RELEASED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				workspaceId: 'ws-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleWorkspaceReleased).toHaveBeenCalledWith(message);
		});

		it('should route STOP_REQUESTED to event handler', () => {
			const message: REMOVE_W2OStopRequestedMessage = createMessage(W2OMessageType.STOP_REQUESTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				claudePid: 12345,
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleStopRequested).toHaveBeenCalledWith(message);
		});

		it('should route HOOK_EVENT to event handler', () => {
			const message: W2OHookEventMessage = createMessage(W2OMessageType.HOOK_EVENT, {
				workerId: 'worker-1',
				hookName: 'test',
				data: {},
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(mockEventHandler.handleHookEvent).toHaveBeenCalledWith(message);
		});
	});

	describe('Error Handling', () => {
		it('should handle unknown message type', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const unknownMessage = {
				type: 'unknown_type',
				timestamp: new Date().toISOString(),
			};

			messageRouter.routeMessage(mockSocket as any, unknownMessage as any, 'worker-1');

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown message type: unknown_type'));

			consoleSpy.mockRestore();
		});
	});

	describe('Logging', () => {
		it('should log received messages with worker ID', () => {
			const message: W2OTaskStartedMessage = createMessage(W2OMessageType.TASK_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining('Received w2o:task:started from worker-1')
			);
		});

		it('should log received messages without worker ID as unknown', () => {
			const message: W2OWorkerReadyMessage = createMessage(W2OMessageType.WORKER_READY, {
				// workerType: WorkerType.DEV,
				projectId: 'test-project',
				workspacePath: '/test/path',
				availableFlows: [],
			});

			messageRouter.routeMessage(mockSocket as any, message, null);

			expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Received w2o:worker:ready from unknown'));
		});
	});
});
