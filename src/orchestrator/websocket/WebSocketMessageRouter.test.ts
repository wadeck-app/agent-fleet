/**
 * WebSocketMessageRouter Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketMessageRouter } from './WebSocketMessageRouter.js';
import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';
import { WebSocketEventHandler } from './WebSocketEventHandler.js';
import {
  MessageType,
  WorkerType,
  WorkerReadyMessage,
  WorkerHeartbeatMessage,
  TaskStartedMessage,
  TaskProgressMessage,
  TaskCompletedMessage,
  TaskFailedMessage,
  TaskQuestionMessage,
  FlowStepStartedMessage,
  FlowStepCompletedMessage,
  FlowStepFailedMessage,
  WorkspaceAllocatedMessage,
  WorkspaceReleasedMessage,
  StopRequestedMessage,
  HookEventMessage,
} from '../../shared/types.js';
import { createMessage } from '../../shared/protocol.js';
import { Logger } from '../../shared/Logger.js';

// Mock WebSocket class
class MockWebSocket {
  public readyState = 1; // OPEN
  send = vi.fn();
  close = vi.fn();
}

// Mock dependencies
vi.mock('./WebSocketConnectionManager.js');
vi.mock('./WebSocketEventHandler.js');
vi.mock('../../shared/Logger.js');

describe('WebSocketMessageRouter', () => {
  let messageRouter: WebSocketMessageRouter;
  let mockConnectionManager: WebSocketConnectionManager;
  let mockEventHandler: WebSocketEventHandler;
  let mockSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();

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

    vi.mocked(Logger.log).mockImplementation(() => {});

    // Create message router
    messageRouter = new WebSocketMessageRouter(mockConnectionManager, mockEventHandler);
  });

  describe('Message Routing', () => {
    it('should route WORKER_READY to connection manager', () => {
      const message: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
        workerType: WorkerType.DEV,
      });

      vi.mocked(mockConnectionManager.handleWorkerReady).mockReturnValue('worker-1');

      const result = messageRouter.routeMessage(mockSocket as any, message, null);

      expect(mockConnectionManager.handleWorkerReady).toHaveBeenCalledWith(mockSocket, message);
      expect(result).toBe('worker-1');
    });

    it('should route WORKER_HEARTBEAT to connection manager', () => {
      const message: WorkerHeartbeatMessage = createMessage(MessageType.WORKER_HEARTBEAT, {
        workerId: 'worker-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
        mockSocket,
        expect.objectContaining({ type: MessageType.ACK })
      );
    });

    it('should route TASK_STARTED to event handler', () => {
      const message: TaskStartedMessage = createMessage(MessageType.TASK_STARTED, {
        workerId: 'worker-1',
        taskId: 'task-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleTaskStarted).toHaveBeenCalledWith(message);
    });

    it('should route TASK_PROGRESS to event handler', () => {
      const message: TaskProgressMessage = createMessage(MessageType.TASK_PROGRESS, {
        workerId: 'worker-1',
        taskId: 'task-1',
        progress: 'Working',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleTaskProgress).toHaveBeenCalledWith(message);
    });

    it('should route TASK_COMPLETED to event handler', () => {
      const message: TaskCompletedMessage = createMessage(MessageType.TASK_COMPLETED, {
        workerId: 'worker-1',
        taskId: 'task-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleTaskCompleted).toHaveBeenCalledWith(message);
    });

    it('should route TASK_FAILED to event handler', () => {
      const message: TaskFailedMessage = createMessage(MessageType.TASK_FAILED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        error: 'Error',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleTaskFailed).toHaveBeenCalledWith(message);
    });

    it('should route TASK_QUESTION to event handler', () => {
      const message: TaskQuestionMessage = createMessage(MessageType.TASK_QUESTION, {
        workerId: 'worker-1',
        taskId: 'task-1',
        question: 'Question?',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleTaskQuestion).toHaveBeenCalledWith(message);
    });

    it('should route FLOW_STEP_STARTED to event handler', () => {
      const message: FlowStepStartedMessage = createMessage(MessageType.FLOW_STEP_STARTED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        stepId: 'step-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleFlowStepStarted).toHaveBeenCalledWith(message);
    });

    it('should route FLOW_STEP_COMPLETED to event handler', () => {
      const message: FlowStepCompletedMessage = createMessage(MessageType.FLOW_STEP_COMPLETED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        stepId: 'step-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleFlowStepCompleted).toHaveBeenCalledWith(message);
    });

    it('should route FLOW_STEP_FAILED to event handler', () => {
      const message: FlowStepFailedMessage = createMessage(MessageType.FLOW_STEP_FAILED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        stepId: 'step-1',
        error: 'Error',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleFlowStepFailed).toHaveBeenCalledWith(message);
    });

    it('should route WORKSPACE_ALLOCATED to event handler', () => {
      const message: WorkspaceAllocatedMessage = createMessage(MessageType.WORKSPACE_ALLOCATED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        workspaceId: 'ws-1',
        workspacePath: '/path',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleWorkspaceAllocated).toHaveBeenCalledWith(message);
    });

    it('should route WORKSPACE_RELEASED to event handler', () => {
      const message: WorkspaceReleasedMessage = createMessage(MessageType.WORKSPACE_RELEASED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        workspaceId: 'ws-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleWorkspaceReleased).toHaveBeenCalledWith(message);
    });

    it('should route STOP_REQUESTED to event handler', () => {
      const message: StopRequestedMessage = createMessage(MessageType.STOP_REQUESTED, {
        workerId: 'worker-1',
        taskId: 'task-1',
        claudePid: 12345,
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(mockEventHandler.handleStopRequested).toHaveBeenCalledWith(message);
    });

    it('should route HOOK_EVENT to event handler', () => {
      const message: HookEventMessage = createMessage(MessageType.HOOK_EVENT, {
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

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type: unknown_type')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Logging', () => {
    it('should log received messages with worker ID', () => {
      const message: TaskStartedMessage = createMessage(MessageType.TASK_STARTED, {
        workerId: 'worker-1',
        taskId: 'task-1',
      });

      messageRouter.routeMessage(mockSocket as any, message, 'worker-1');

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Received task_started from worker-1')
      );
    });

    it('should log received messages without worker ID as unknown', () => {
      const message: WorkerReadyMessage = createMessage(MessageType.WORKER_READY, {
        workerType: WorkerType.DEV,
      });

      messageRouter.routeMessage(mockSocket as any, message, null);

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Received worker_ready from unknown')
      );
    });
  });
});
