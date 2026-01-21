/**
 * WebSocketEventHandler Tests
 */
import {
	MockWebSocket,
	createMockConnectionManager,
	createMockStateManager,
	createMockTaskManager,
} from 'orchestrator/test-utils/mocks';
import { UIMessageType } from 'orchestrator/ui-client/types';
import { logger } from 'shared-common/logger';
import type { Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import type { KillClaudeMessage } from 'shared-orch-worker/orchestrator-messages';
import { O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
import type {
	REMOVE_W2OStopRequestedMessage,
	W2OFlowStepCompletedMessage,
	W2OFlowStepFailedMessage,
	W2OFlowStepStartedMessage,
	W2OHookEventMessage,
	W2OTaskCompletedMessage,
	W2OTaskFailedMessage,
	W2OTaskProgressMessage,
	W2OTaskQuestionMessage,
	W2OTaskStartedMessage,
	W2OWorkspaceAllocatedMessage,
	W2OWorkspaceReleasedMessage,
} from 'shared-orch-worker/worker-messages';
import { W2OMessageType, createW2OMessage } from 'shared-orch-worker/worker-messages';
import { setupTest } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketEventHandler } from './WebSocketEventHandler';

// Mock dependencies
vi.mock('./TaskManager');
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./WebSocketConnectionManager');

describe('WebSocketEventHandler', () => {
	let cleanup: () => void;
	let eventHandler: WebSocketEventHandler;
	let mockTaskManager: ReturnType<typeof createMockTaskManager>;
	let mockStateManager: ReturnType<typeof createMockStateManager>;
	let mockConnectionManager: ReturnType<typeof createMockConnectionManager>;
	let mockWorkerCoordinator: { onWorkerMessage: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		cleanup = setupTest();

		// Create mocks using test-utils
		mockTaskManager = createMockTaskManager();
		mockStateManager = createMockStateManager();
		mockConnectionManager = createMockConnectionManager();

		// Create mock worker coordinator
		mockWorkerCoordinator = {
			onWorkerMessage: vi.fn(),
		};

		// Create mock intervention manager
		const mockInterventionManager = {
			createIntervention: vi.fn(),
			respondToIntervention: vi.fn(),
			cancelIntervention: vi.fn(),
		};

		// Create event handler
		eventHandler = new WebSocketEventHandler(
			mockWorkerCoordinator as any,
			mockStateManager as any,
			mockConnectionManager as any,
			mockInterventionManager as any
		);
	});

	afterEach(() => {
		cleanup();
	});

	describe('TASK_STARTED Message Handling', () => {
		it('should handle TASK_STARTED message', () => {
			const startedMessage: W2OTaskStartedMessage = createW2OMessage(W2OMessageType.TASK_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			eventHandler.handleTaskStarted(startedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', startedMessage);
		});

		it('should handle TASK_STARTED with custom status', () => {
			const startedMessage: W2OTaskStartedMessage = createW2OMessage(W2OMessageType.TASK_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				newStatus: TaskStatus.TESTING,
			});

			eventHandler.handleTaskStarted(startedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', startedMessage);
		});
	});

	describe('TASK_PROGRESS Message Handling', () => {
		it('should handle TASK_PROGRESS message', () => {
			const progressMessage: W2OTaskProgressMessage = createW2OMessage(W2OMessageType.TASK_PROGRESS, {
				workerId: 'worker-1',
				taskId: 'task-1',
				progress: 'Working on implementation',
			});

			eventHandler.handleTaskProgress(progressMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', progressMessage);
		});
	});

	describe('TASK_COMPLETED Message Handling', () => {
		beforeEach(() => {
			vi.mocked(mockConnectionManager.getWorker).mockReturnValue({
				id: 'worker-1',
				// type: WorkerType.DEV,
				taskId: 'task-1',
				connectedAt: new Date().toISOString(),
				socket: new MockWebSocket() as any,
			});
		});

		it('should handle TASK_COMPLETED message', () => {
			const completedMessage: W2OTaskCompletedMessage = createW2OMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				result: { success: true },
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', completedMessage);
		});

		it('should handle TASK_COMPLETED with custom status', () => {
			const completedMessage: W2OTaskCompletedMessage = createW2OMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				newStatus: TaskStatus.MERGED,
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', completedMessage);
		});

		it('should release worker after completion', () => {
			const completedMessage: W2OTaskCompletedMessage = createW2OMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockConnectionManager.releaseWorker).toHaveBeenCalledWith('worker-1');
		});

		it('should try to assign new task after completion', () => {
			const completedMessage: W2OTaskCompletedMessage = createW2OMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockConnectionManager.releaseWorker).toHaveBeenCalledWith('worker-1');
		});
	});

	describe('TASK_FAILED Message Handling', () => {
		beforeEach(() => {
			vi.mocked(mockConnectionManager.getWorker).mockReturnValue({
				id: 'worker-1',
				// type: WorkerType.DEV,
				taskId: 'task-1',
				connectedAt: new Date().toISOString(),
				socket: new MockWebSocket() as any,
			});
		});

		it('should handle TASK_FAILED message', () => {
			const failedMessage: W2OTaskFailedMessage = createW2OMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Test execution failed',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', failedMessage);
		});

		it('should handle TASK_FAILED with custom status', () => {
			const failedMessage: W2OTaskFailedMessage = createW2OMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Error',
				newStatus: TaskStatus.CANCELLED,
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', failedMessage);
		});

		it('should add failure comment', () => {
			const failedMessage: W2OTaskFailedMessage = createW2OMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Build failed',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', failedMessage);
		});

		it('should emit worker task released event', () => {
			const failedMessage: W2OTaskFailedMessage = createW2OMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Error',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockStateManager.emitWorkerTaskReleased).toHaveBeenCalledWith('worker-1');
		});
	});

	describe('TASK_QUESTION Message Handling', () => {
		it('should handle TASK_QUESTION message', () => {
			const questionMessage: W2OTaskQuestionMessage = createW2OMessage(W2OMessageType.TASK_QUESTION, {
				workerId: 'worker-1',
				taskId: 'task-1',
				question: 'Need clarification on requirements',
			});

			eventHandler.handleTaskQuestion(questionMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', questionMessage);
		});

		it('should add question as comment', () => {
			const questionMessage: W2OTaskQuestionMessage = createW2OMessage(W2OMessageType.TASK_QUESTION, {
				workerId: 'worker-1',
				taskId: 'task-1',
				question: 'What should be the output format?',
			});

			eventHandler.handleTaskQuestion(questionMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', questionMessage);
		});
	});

	describe('Flow Step Messages', () => {
		let mockTask: Task;

		beforeEach(() => {
			mockTask = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);
		});

		it('should handle FLOW_STEP_STARTED message', () => {
			const stepStartedMessage: W2OFlowStepStartedMessage = createW2OMessage(W2OMessageType.FLOW_STEP_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
				stepName: 'Initialize',
			});

			eventHandler.handleFlowStepStarted(stepStartedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', stepStartedMessage);
		});

		it('should handle FLOW_STEP_STARTED without step name', () => {
			const stepStartedMessage: W2OFlowStepStartedMessage = createW2OMessage(W2OMessageType.FLOW_STEP_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
			});

			eventHandler.handleFlowStepStarted(stepStartedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', stepStartedMessage);
		});

		it('should handle FLOW_STEP_COMPLETED message', () => {
			const stepCompletedMessage: W2OFlowStepCompletedMessage = createW2OMessage(
				W2OMessageType.FLOW_STEP_COMPLETED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					stepId: 'step-1',
					outputs: { result: 'success' },
				}
			);

			eventHandler.handleFlowStepCompleted(stepCompletedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', stepCompletedMessage);
		});

		it('should handle FLOW_STEP_COMPLETED without outputs', () => {
			const stepCompletedMessage: W2OFlowStepCompletedMessage = createW2OMessage(
				W2OMessageType.FLOW_STEP_COMPLETED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					stepId: 'step-1',
				}
			);

			eventHandler.handleFlowStepCompleted(stepCompletedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', stepCompletedMessage);
		});

		it('should handle FLOW_STEP_FAILED message', () => {
			const stepFailedMessage: W2OFlowStepFailedMessage = createW2OMessage(W2OMessageType.FLOW_STEP_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
				error: 'Step execution failed',
			});

			eventHandler.handleFlowStepFailed(stepFailedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', stepFailedMessage);
		});
	});

	describe('Workspace Messages', () => {
		let mockTask: Task;

		beforeEach(() => {
			mockTask = {
				id: 'task-1',
				description: 'Test task',
				status: TaskStatus.IN_PROGRESS,
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedTo: null,
				comments: [],
				metadata: {},
				history: [],
			};

			vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);
		});

		it('should handle WORKSPACE_ALLOCATED message', () => {
			const allocatedMessage: W2OWorkspaceAllocatedMessage = createW2OMessage(
				W2OMessageType.WORKSPACE_ALLOCATED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					workspaceId: 'ws-1',
					workspacePath: '/path/to/workspace',
				}
			);

			eventHandler.handleWorkspaceAllocated(allocatedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', allocatedMessage);
		});

		it('should handle WORKSPACE_RELEASED message', () => {
			const releasedMessage: W2OWorkspaceReleasedMessage = createW2OMessage(W2OMessageType.WORKSPACE_RELEASED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				workspaceId: 'ws-1',
			});

			eventHandler.handleWorkspaceReleased(releasedMessage);

			expect(mockWorkerCoordinator.onWorkerMessage).toHaveBeenCalledWith('worker-1', releasedMessage);
		});
	});

	describe('STOP_REQUESTED Message Handling', () => {
		it('should handle STOP_REQUESTED message', () => {
			const mockSocket = new MockWebSocket();
			vi.mocked(mockConnectionManager.getWorker).mockReturnValue({
				id: 'worker-1',
				// type: WorkerType.DEV,
				taskId: 'task-1',
				connectedAt: new Date().toISOString(),
				socket: mockSocket as any,
			});

			const stopMessage: REMOVE_W2OStopRequestedMessage = createW2OMessage(W2OMessageType.STOP_REQUESTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				claudePid: 12345,
			});

			eventHandler.handleStopRequested(stopMessage);

			expect(mockConnectionManager.sendMessage).toHaveBeenCalled();
			const callArgs = vi.mocked(mockConnectionManager.sendMessage).mock.calls[0];
			expect(callArgs[0]).toBe(mockSocket);
			expect(callArgs[1].type).toBe(O2WMessageType.KILL_CLAUDE);
			expect((callArgs[1] as KillClaudeMessage).reason).toBe('stop_requested');
		});
	});
});
