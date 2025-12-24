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
import { createMessage } from 'shared-common/protocol';
import { Task, TaskStatus } from 'shared-orch-worker/domain-types';
import { KillClaudeMessage, O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
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
	W2OWorkspaceAllocatedMessage,
	W2OWorkspaceReleasedMessage,
} from 'shared-orch-worker/worker-messages';
import { setupTest } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketEventHandler } from './WebSocketEventHandler';

// Mock dependencies
vi.mock('./TaskManager');
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger');
vi.mock('./WebSocketConnectionManager');

describe('WebSocketEventHandler', () => {
	let cleanup: () => void;
	let eventHandler: WebSocketEventHandler;
	let mockTaskManager: ReturnType<typeof createMockTaskManager>;
	let mockStateManager: ReturnType<typeof createMockStateManager>;
	let mockConnectionManager: ReturnType<typeof createMockConnectionManager>;

	beforeEach(() => {
		cleanup = setupTest();

		// Create mocks using test-utils
		mockTaskManager = createMockTaskManager();
		mockStateManager = createMockStateManager();
		mockConnectionManager = createMockConnectionManager();

		// Create event handler
		eventHandler = new WebSocketEventHandler(
			mockTaskManager as any,
			mockStateManager as any,
			mockConnectionManager as any
		);
	});

	afterEach(() => {
		cleanup();
	});

	describe('TASK_STARTED Message Handling', () => {
		it('should handle TASK_STARTED message', () => {
			const startedMessage: W2OTaskStartedMessage = createMessage(W2OMessageType.TASK_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			eventHandler.handleTaskStarted(startedMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.IN_PROGRESS,
				expect.objectContaining({
					event: 'started',
					workerId: 'worker-1',
				})
			);
		});

		it('should handle TASK_STARTED with custom status', () => {
			const startedMessage: W2OTaskStartedMessage = createMessage(W2OMessageType.TASK_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				newStatus: TaskStatus.TESTING,
			});

			eventHandler.handleTaskStarted(startedMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.TESTING,
				expect.any(Object)
			);
		});
	});

	describe('TASK_PROGRESS Message Handling', () => {
		it('should handle TASK_PROGRESS message', () => {
			const progressMessage: W2OTaskProgressMessage = createMessage(W2OMessageType.TASK_PROGRESS, {
				workerId: 'worker-1',
				taskId: 'task-1',
				progress: 'Working on implementation',
			});

			eventHandler.handleTaskProgress(progressMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith(
				'task-1',
				'worker-worker-1',
				'Working on implementation'
			);
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
			const completedMessage: W2OTaskCompletedMessage = createMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				result: { success: true },
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.REVIEW,
				expect.objectContaining({
					event: 'completed',
					workerId: 'worker-1',
					result: { success: true },
				})
			);
		});

		it('should handle TASK_COMPLETED with custom status', () => {
			const completedMessage: W2OTaskCompletedMessage = createMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				newStatus: TaskStatus.MERGED,
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.MERGED,
				expect.any(Object)
			);
		});

		it('should release worker after completion', () => {
			const completedMessage: W2OTaskCompletedMessage = createMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: 'worker-1',
				taskId: 'task-1',
			});

			eventHandler.handleTaskCompleted(completedMessage);

			expect(mockConnectionManager.releaseWorker).toHaveBeenCalledWith('worker-1');
		});

		it('should try to assign new task after completion', () => {
			const completedMessage: W2OTaskCompletedMessage = createMessage(W2OMessageType.TASK_COMPLETED, {
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
			const failedMessage: W2OTaskFailedMessage = createMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Test execution failed',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.BLOCKED,
				expect.objectContaining({
					event: 'failed',
					workerId: 'worker-1',
					error: 'Test execution failed',
				})
			);
		});

		it('should handle TASK_FAILED with custom status', () => {
			const failedMessage: W2OTaskFailedMessage = createMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Error',
				newStatus: TaskStatus.CANCELLED,
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.CANCELLED,
				expect.any(Object)
			);
		});

		it('should add failure comment', () => {
			const failedMessage: W2OTaskFailedMessage = createMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Build failed',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith('task-1', 'system', 'Task failed: Build failed');
		});

		it('should emit worker task released event', () => {
			const failedMessage: W2OTaskFailedMessage = createMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Error',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(mockStateManager.emitWorkerTaskReleased).toHaveBeenCalledWith('worker-1');
		});

		it('should log error', () => {
			const failedMessage: W2OTaskFailedMessage = createMessage(W2OMessageType.TASK_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				error: 'Critical error',
			});

			eventHandler.handleTaskFailed(failedMessage);

			expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed task task-1'));
		});
	});

	describe('TASK_QUESTION Message Handling', () => {
		it('should handle TASK_QUESTION message', () => {
			const questionMessage: W2OTaskQuestionMessage = createMessage(W2OMessageType.TASK_QUESTION, {
				workerId: 'worker-1',
				taskId: 'task-1',
				question: 'Need clarification on requirements',
			});

			eventHandler.handleTaskQuestion(questionMessage);

			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith(
				'task-1',
				TaskStatus.BLOCKED,
				expect.objectContaining({
					event: 'question_raised',
					workerId: 'worker-1',
					question: 'Need clarification on requirements',
				})
			);
		});

		it('should add question as comment', () => {
			const questionMessage: W2OTaskQuestionMessage = createMessage(W2OMessageType.TASK_QUESTION, {
				workerId: 'worker-1',
				taskId: 'task-1',
				question: 'What should be the output format?',
			});

			eventHandler.handleTaskQuestion(questionMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith(
				'task-1',
				'worker-worker-1',
				'Question: What should be the output format?'
			);
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
			const stepStartedMessage: W2OFlowStepStartedMessage = createMessage(W2OMessageType.FLOW_STEP_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
				stepName: 'Initialize',
			});

			eventHandler.handleFlowStepStarted(stepStartedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith(
				'task-1',
				'system',
				'Flow step started: Initialize'
			);
		});

		it('should handle FLOW_STEP_STARTED without step name', () => {
			const stepStartedMessage: W2OFlowStepStartedMessage = createMessage(W2OMessageType.FLOW_STEP_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
			});

			eventHandler.handleFlowStepStarted(stepStartedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith('task-1', 'system', 'Flow step started: step-1');
		});

		it('should handle FLOW_STEP_COMPLETED message', () => {
			const stepCompletedMessage: W2OFlowStepCompletedMessage = createMessage(
				W2OMessageType.FLOW_STEP_COMPLETED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					stepId: 'step-1',
					outputs: { result: 'success' },
				}
			);

			eventHandler.handleFlowStepCompleted(stepCompletedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith(
				'task-1',
				'system',
				expect.stringContaining('Flow step completed: step-1')
			);
		});

		it('should handle FLOW_STEP_COMPLETED without outputs', () => {
			const stepCompletedMessage: W2OFlowStepCompletedMessage = createMessage(
				W2OMessageType.FLOW_STEP_COMPLETED,
				{
					workerId: 'worker-1',
					taskId: 'task-1',
					stepId: 'step-1',
				}
			);

			eventHandler.handleFlowStepCompleted(stepCompletedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith('task-1', 'system', 'Flow step completed: step-1');
		});

		it('should handle FLOW_STEP_FAILED message', () => {
			const stepFailedMessage: W2OFlowStepFailedMessage = createMessage(W2OMessageType.FLOW_STEP_FAILED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
				error: 'Step execution failed',
			});

			eventHandler.handleFlowStepFailed(stepFailedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith(
				'task-1',
				'system',
				'Flow step failed: step-1 - Step execution failed'
			);
		});

		it('should emit task updated for flow step events', () => {
			const stepStartedMessage: W2OFlowStepStartedMessage = createMessage(W2OMessageType.FLOW_STEP_STARTED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				stepId: 'step-1',
			});

			eventHandler.handleFlowStepStarted(stepStartedMessage);

			expect(mockStateManager.emitTaskUpdated).toHaveBeenCalledWith(mockTask);
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
			const allocatedMessage: W2OWorkspaceAllocatedMessage = createMessage(W2OMessageType.WORKSPACE_ALLOCATED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				workspaceId: 'ws-1',
				workspacePath: '/path/to/workspace',
			});

			eventHandler.handleWorkspaceAllocated(allocatedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith(
				'task-1',
				'system',
				'Workspace allocated: /path/to/workspace'
			);
		});

		it('should store workspace info in task metadata', () => {
			const allocatedMessage: W2OWorkspaceAllocatedMessage = createMessage(W2OMessageType.WORKSPACE_ALLOCATED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				workspaceId: 'ws-1',
				workspacePath: '/path/to/workspace',
			});

			eventHandler.handleWorkspaceAllocated(allocatedMessage);

			expect(mockTask.metadata.workspaceId).toBe('ws-1');
			expect(mockTask.metadata.workspacePath).toBe('/path/to/workspace');
		});

		it('should handle WORKSPACE_RELEASED message', () => {
			const releasedMessage: W2OWorkspaceReleasedMessage = createMessage(W2OMessageType.WORKSPACE_RELEASED, {
				workerId: 'worker-1',
				taskId: 'task-1',
				workspaceId: 'ws-1',
			});

			eventHandler.handleWorkspaceReleased(releasedMessage);

			expect(mockTaskManager.addComment).toHaveBeenCalledWith('task-1', 'system', 'Workspace released: ws-1');
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

			const stopMessage: REMOVE_W2OStopRequestedMessage = createMessage(W2OMessageType.STOP_REQUESTED, {
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

	describe('HOOK_EVENT Message Handling', () => {
		it('should handle HOOK_EVENT message', () => {
			const hookMessage: W2OHookEventMessage = createMessage(W2OMessageType.HOOK_EVENT, {
				workerId: 'worker-1',
				hookName: 'test-hook',
				data: { key: 'value' },
			});

			eventHandler.handleHookEvent(hookMessage);

			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining('Hook event test-hook from worker worker-1')
			);
		});
	});
});
