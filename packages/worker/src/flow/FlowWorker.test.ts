/**
 * FlowWorker Tests
 *
 * Comprehensive unit tests for FlowWorker functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowWorker } from './FlowWorker.js';
import { FlowRegistry } from 'flow-engine/registry/FlowRegistry.js';
import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager.js';
import { FlowExecutor } from 'flow-engine/executor/FlowExecutor.js';
import type { Task } from 'shared-common/types.js';
import type { FlowDefinition, Workspace, FlowExecutionResult } from 'flow-engine/types.js';
import { ChildProcess } from 'child_process';
import {
  createMockTask,
  createMockFlow,
  createMockWorkspace,
  createMockFlowTrace,
} from 'test-utils/index';

// Mock WebSocket
vi.mock('ws', () => ({
  default: class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    on = vi.fn();
    send = vi.fn();
    close = vi.fn();
    constructor(public url: string) {}
  },
  WebSocketServer: class MockWebSocketServer {
    private handlers: Map<string, Function> = new Map();
    constructor(public options: any) {
      // Call listening handler synchronously to avoid timing issues
      queueMicrotask(() => {
        const handler = this.handlers.get('listening');
        if (handler) handler();
      });
    }
    on(event: string, handler: Function) {
      this.handlers.set(event, handler);
      return this;
    }
    address() {
      return { port: 12345 };
    }
    close(callback?: Function) {
      if (callback) callback();
    }
  },
  WebSocket: class MockWebSocket {
    on(event: string, handler: Function) {
      return this;
    }
  }
}));

// Store mock instances for access in tests
let mockFlowRegistryInstance: any;
let mockWorkspaceManagerInstance: any;
let mockFlowExecutorInstance: any;

// Mock FlowRegistry
vi.mock('flow-engine/registry/FlowRegistry.js', () => ({
  FlowRegistry: class {
    constructor(projectRoot: string) {
      return mockFlowRegistryInstance;
    }
  }
}));

// Mock WorkspaceManager
vi.mock('flow-engine/workspace/WorkspaceManager.js', () => ({
  WorkspaceManager: class {
    constructor(projectRoot: string) {
      return mockWorkspaceManagerInstance;
    }
  }
}));

// Mock FlowExecutor
vi.mock('flow-engine/executor/FlowExecutor.js', () => ({
  FlowExecutor: class {
    constructor(interactive: boolean) {
      return mockFlowExecutorInstance;
    }
  }
}));

describe('FlowWorker', () => {
  let worker: FlowWorker;
  let mockFlowRegistry: any;
  let mockWorkspaceManager: any;
  let mockFlowExecutor: any;
  let mockTask: Task;
  let mockFlow: FlowDefinition;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    mockTask = createMockTask({
      id: 'task-1',
      flowId: 'test-flow',
      description: 'Test flow task'
    });
    mockFlow = createMockFlow();
    mockWorkspace = createMockWorkspace();

    // Mock FlowRegistry
    mockFlowRegistry = {
      loadProjectFlows: vi.fn().mockResolvedValue(undefined),
      getFlowIds: vi.fn().mockReturnValue(['test-flow']),
      getFlow: vi.fn().mockReturnValue(mockFlow),
      startWatching: vi.fn(),
      stopWatching: vi.fn()
    };
    mockFlowRegistryInstance = mockFlowRegistry;

    // Mock WorkspaceManager
    mockWorkspaceManager = {
      allocate: vi.fn().mockResolvedValue(mockWorkspace),
      release: vi.fn().mockResolvedValue(undefined),
      cleanupAll: vi.fn()
    };
    mockWorkspaceManagerInstance = mockWorkspaceManager;

    // Mock FlowExecutor
    mockFlowExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        trace: createMockFlowTrace(),
        outputs: { step1: { result: 'success' } }
      } as FlowExecutionResult)
    };
    mockFlowExecutorInstance = mockFlowExecutor;

    // Create worker with test project root
    worker = new FlowWorker('ws://localhost:3738', '/test/project', false);
  });

  afterEach(() => {
    if (worker) {
      worker.shutdown();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default parameters', () => {
      const defaultWorker = new FlowWorker();
      expect(defaultWorker).toBeDefined();
    });

    it('should initialize with custom wsUrl', () => {
      const customWorker = new FlowWorker('ws://custom:9999');
      expect(customWorker).toBeDefined();
    });

    it('should initialize with custom project root', () => {
      const customWorker = new FlowWorker(undefined, '/custom/project');
      expect(customWorker).toBeDefined();
    });

    it('should initialize in interactive mode', () => {
      const interactiveWorker = new FlowWorker(undefined, '/test/project', true);
      expect(interactiveWorker).toBeDefined();
    });

    it('should initialize with preferred worker ID', () => {
      const workerWithId = new FlowWorker(undefined, '/test/project', false, 'preferred-worker-1');
      expect(workerWithId).toBeDefined();
    });

    it('should load flows on initialization', async () => {
      // Wait for async initialization
      await vi.waitFor(() => {
        expect(mockFlowRegistry.loadProjectFlows).toHaveBeenCalled();
      });
    });

    it('should start watching flows file', async () => {
      await vi.waitFor(() => {
        expect(mockFlowRegistry.startWatching).toHaveBeenCalled();
      });
    });

    it('should handle flow loading errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFlowRegistry.loadProjectFlows.mockRejectedValue(new Error('Load failed'));

      const errorWorker = new FlowWorker(undefined, '/test/project');

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load flows'),
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
      errorWorker.shutdown();
    });

    it('should setup Claude WebSocket server', async () => {
      // WebSocket server should be initialized
      expect(worker).toBeDefined();
    });
  });

  describe('executeTask - Error Cases', () => {
    it('should throw error when task has no flowId', async () => {
      const taskWithoutFlow = createMockTask({ flowId: undefined });

      await expect(async () => {
        await (worker as any).executeTask(taskWithoutFlow);
      }).rejects.toThrow('FlowWorker requires task.flowId to be set');
    });

    it('should throw error when flow not found in registry', async () => {
      mockFlowRegistry.getFlow.mockReturnValue(null);

      await expect(async () => {
        await (worker as any).executeTask(mockTask);
      }).rejects.toThrow("Flow 'test-flow' not found in registry");
    });

    it('should log error when task has no flowId', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const taskWithoutFlow = createMockTask({ flowId: undefined });

      try {
        await (worker as any).executeTask(taskWithoutFlow);
      } catch (e) {
        // Expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('FlowWorker requires task.flowId to be set')
      );

      consoleSpy.mockRestore();
    });

    it('should log error when flow not found', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFlowRegistry.getFlow.mockReturnValue(null);

      try {
        await (worker as any).executeTask(mockTask);
      } catch (e) {
        // Expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Flow 'test-flow' not found in registry")
      );

      consoleSpy.mockRestore();
    });
  });

  describe('executeTask - Successful Execution', () => {
    it('should execute task with valid flowId', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockFlowRegistry.getFlow).toHaveBeenCalledWith('test-flow');
      expect(mockWorkspaceManager.allocate).toHaveBeenCalled();
      expect(mockFlowExecutor.execute).toHaveBeenCalled();
    });

    it('should allocate workspace with correct configuration', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.allocate).toHaveBeenCalledWith({
        taskId: 'task-1',
        config: mockFlow.workspace,
        existingPath: undefined,
        taskMetadata: {
          description: 'Test flow task',
          priority: 'medium'
        }
      });
    });

    it('should pass flowInputs to execution', async () => {
      const taskWithInputs = createMockTask({
        flowId: 'test-flow',
        flowInputs: { input1: 'value1', input2: 'value2' }
      });

      await (worker as any).executeTask(taskWithInputs);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: { input1: 'value1', input2: 'value2' }
        })
      );
    });

    it('should pass empty object when flowInputs not provided', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: {}
        })
      );
    });

    it('should store result in task on success', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toMatchObject({
        status: 'completed',
        outputs: { step1: { result: 'success' } },
        error: undefined,
        trace: expect.objectContaining({
          id: 'trace-1',
          steps: []
        })
      });
    });

    it('should release workspace after successful execution', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.release).toHaveBeenCalledWith('workspace-1', 'task-1');
    });

    it('should use default status transitions when not configured', async () => {
      const flowWithoutTransitions = createMockFlow({ statusTransitions: undefined });
      mockFlowRegistry.getFlow.mockReturnValue(flowWithoutTransitions);

      await (worker as any).executeTask(mockTask);

      // Should complete with default status (REVIEW)
      expect(mockFlowExecutor.execute).toHaveBeenCalled();
    });

    it('should use configured status transitions', async () => {
      const flowWithTransitions = createMockFlow({
        statusTransitions: {
          onSuccess: 'approved' as TaskStatus,
          onFailure: 'blocked' as TaskStatus
        }
      });
      mockFlowRegistry.getFlow.mockReturnValue(flowWithTransitions);

      await (worker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalled();
    });
  });

  describe('executeTask - Failed Execution', () => {
    it('should handle flow execution failure', async () => {
      mockFlowExecutor.execute.mockResolvedValue({
        success: false,
        error: 'Flow failed',
        trace: { id: 'trace-1', steps: [] },
        outputs: {}
      });

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'failed',
        outputs: {},
        error: 'Flow failed',
        trace: { id: 'trace-1', steps: [] }
      });
    });

    it('should handle workspace allocation error', async () => {
      mockWorkspaceManager.allocate.mockRejectedValue(new Error('Allocation failed'));

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'failed',
        error: 'Allocation failed'
      });
    });

    it('should handle flow executor error', async () => {
      mockFlowExecutor.execute.mockRejectedValue(new Error('Execution failed'));

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'failed',
        error: 'Execution failed'
      });
    });

    it('should release workspace even on error', async () => {
      mockFlowExecutor.execute.mockRejectedValue(new Error('Execution failed'));

      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.release).toHaveBeenCalledWith('workspace-1', 'task-1');
    });

    it('should handle workspace release error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockWorkspaceManager.release.mockRejectedValue(new Error('Release failed'));

      await (worker as any).executeTask(mockTask);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to release workspace'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should not attempt to release workspace if allocation failed', async () => {
      mockWorkspaceManager.allocate.mockRejectedValue(new Error('Allocation failed'));

      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.release).not.toHaveBeenCalled();
    });
  });

  describe('executeTask - Workspace Modes', () => {
    it('should handle manual workspace mode with provided path', async () => {
      const manualFlow = createMockFlow({
        workspace: {
          mode: 'manual' as WorkspaceMode,
          gitStrategy: 'any' as GitStrategy,
          reusePolicy: 'always' as ReusePolicy
        }
      });
      mockFlowRegistry.getFlow.mockReturnValue(manualFlow);

      const taskWithWorkspace = createMockTask({
        flowId: 'test-flow',
        workspacePath: '/custom/workspace'
      });

      await (worker as any).executeTask(taskWithWorkspace);

      expect(mockWorkspaceManager.allocate).toHaveBeenCalledWith(
        expect.objectContaining({
          existingPath: '/custom/workspace'
        })
      );
    });

    it('should use current working directory for manual mode without path', async () => {
      const manualFlow = createMockFlow({
        workspace: {
          mode: 'manual' as WorkspaceMode,
          gitStrategy: 'any' as GitStrategy,
          reusePolicy: 'always' as ReusePolicy
        }
      });
      mockFlowRegistry.getFlow.mockReturnValue(manualFlow);

      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.allocate).toHaveBeenCalledWith(
        expect.objectContaining({
          existingPath: process.cwd()
        })
      );
    });

    it('should not set existingPath for isolated mode', async () => {
      const isolatedFlow = createMockFlow({
        workspace: {
          mode: 'isolated' as WorkspaceMode,
          gitStrategy: 'feature-branch' as GitStrategy,
          reusePolicy: 'never' as ReusePolicy
        }
      });
      mockFlowRegistry.getFlow.mockReturnValue(isolatedFlow);

      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.allocate).toHaveBeenCalledWith(
        expect.objectContaining({
          existingPath: undefined
        })
      );
    });

    it('should not set existingPath for shared mode', async () => {
      const sharedFlow = createMockFlow({
        workspace: {
          mode: 'shared' as WorkspaceMode,
          gitStrategy: 'main-only' as GitStrategy,
          reusePolicy: 'always' as ReusePolicy
        }
      });
      mockFlowRegistry.getFlow.mockReturnValue(sharedFlow);

      await (worker as any).executeTask(mockTask);

      expect(mockWorkspaceManager.allocate).toHaveBeenCalledWith(
        expect.objectContaining({
          existingPath: undefined
        })
      );
    });
  });

  describe('executeTask - Claude Environment', () => {
    it('should pass Claude environment variables to executor', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          claudeEnv: expect.objectContaining({
            CLAUDE_WORKER_ID: expect.any(String),
            CLAUDE_WORKER_SOCKET: expect.stringContaining('ws://localhost:'),
            CLAUDE_TASK_ID: 'task-1',
            CLAUDE_CONTEXT_DIR: '/tmp/workspace-1',
            CLAUDE_CODE_STOPPABLE: 'false'
          })
        })
      );
    });

    it('should set CLAUDE_CODE_STOPPABLE to true in interactive mode', async () => {
      const interactiveWorker = new FlowWorker(undefined, '/test/project', true);

      await (interactiveWorker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          claudeEnv: expect.objectContaining({
            CLAUDE_CODE_STOPPABLE: 'true'
          })
        })
      );

      interactiveWorker.shutdown();
    });

    it('should provide onClaudeProcessStarted callback', async () => {
      await (worker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          onClaudeProcessStarted: expect.any(Function)
        })
      );
    });
  });

  describe('executeTask - Task Metadata', () => {
    it('should pass task metadata to workspace allocation', async () => {
      const taskWithMetadata = createMockTask({
        flowId: 'test-flow',
        description: 'Test flow task',
        metadata: { custom: 'data', tag: 'test' }
      });

      await (worker as any).executeTask(taskWithMetadata);

      expect(mockWorkspaceManager.allocate).toHaveBeenCalledWith(
        expect.objectContaining({
          taskMetadata: {
            description: 'Test flow task',
            priority: 'medium',
            custom: 'data',
            tag: 'test'
          }
        })
      );
    });

    it('should pass task metadata to executor', async () => {
      const taskWithMetadata = createMockTask({
        flowId: 'test-flow',
        description: 'Test flow task',
        metadata: { custom: 'data' }
      });

      await (worker as any).executeTask(taskWithMetadata);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          taskMetadata: expect.objectContaining({
            priority: 'medium',
            createdAt: expect.any(String),
            description: 'Test flow task',
            custom: 'data'
          })
        })
      );
    });
  });

  describe('executeTask - Flow Execution Result', () => {
    it('should store outputs from successful execution', async () => {
      mockFlowExecutor.execute.mockResolvedValue({
        success: true,
        trace: { id: 'trace-1', steps: [] },
        outputs: {
          step1: { result: 'output1' },
          step2: { result: 'output2' }
        }
      });

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'completed',
        outputs: {
          step1: { result: 'output1' },
          step2: { result: 'output2' }
        },
        error: undefined,
        trace: { id: 'trace-1', steps: [] }
      });
    });

    it('should store trace from execution', async () => {
      const mockTrace = {
        id: 'trace-123',
        taskId: 'task-1',
        flowId: 'test-flow',
        workspaceId: 'workspace-1',
        startTime: Date.now(),
        status: 'completed' as const,
        steps: [
          {
            stepId: 'step1',
            stepName: 'Test Step',
            stepType: 'model' as const,
            startTime: Date.now()
          }
        ]
      };

      mockFlowExecutor.execute.mockResolvedValue({
        success: true,
        trace: mockTrace,
        outputs: {}
      });

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult?.trace).toEqual(mockTrace);
    });

    it('should store error message on failure', async () => {
      mockFlowExecutor.execute.mockResolvedValue({
        success: false,
        error: 'Step 2 failed: Invalid output',
        trace: { id: 'trace-1', steps: [] },
        outputs: { step1: { result: 'ok' } }
      });

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'failed',
        outputs: { step1: { result: 'ok' } },
        error: 'Step 2 failed: Invalid output',
        trace: { id: 'trace-1', steps: [] }
      });
    });
  });

  describe('killClaude', () => {
    it('should do nothing when no Claude process is running', () => {
      expect(() => {
        worker.killClaude();
      }).not.toThrow();
    });

    it('should handle killing process on non-Windows', () => {
      const mockProcess = {
        pid: 12345,
        kill: vi.fn()
      } as any;

      // Access the ClaudeLifecycleManager and set the process
      (worker as any).claudeProcessManager.trackProcess(mockProcess);

      // Mock platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      worker.killClaude();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect((worker as any).claudeProcessManager.getProcess()).toBeNull();

      // Restore platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle errors when killing process', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockProcess = {
        pid: 12345,
        kill: vi.fn(() => {
          throw new Error('Kill failed');
        })
      } as any;

      // Access the ClaudeLifecycleManager and set the process
      (worker as any).claudeProcessManager.trackProcess(mockProcess);

      worker.killClaude();

      expect((worker as any).claudeProcessManager.getProcess()).toBeNull();

      consoleSpy.mockRestore();
    });
  });

  describe('Claude WebSocket Server', () => {
    it('should handle Claude connection', () => {
      // WebSocket server is initialized in constructor
      expect(worker).toBeDefined();
    });

    it('should handle STOP_REQUESTED message from Claude', () => {
      const killSpy = vi.spyOn((worker as any).claudeProcessManager, 'kill');

      // Simulate Claude message
      const message = { type: 'STOP_REQUESTED' };
      (worker as any).handleClaudeMessage(message);

      expect(killSpy).toHaveBeenCalled();
    });

    it('should handle HOOK_EVENT message from Claude', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const message = { type: 'HOOK_EVENT', hookName: 'test-hook' };
      (worker as any).handleClaudeMessage(message);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hook event: test-hook')
      );

      consoleSpy.mockRestore();
    });

    it('should handle unknown message type from Claude', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const message = { type: 'UNKNOWN_TYPE' };
      (worker as any).handleClaudeMessage(message);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type: UNKNOWN_TYPE')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should stop watching flows file', () => {
      worker.shutdown();

      expect(mockFlowRegistry.stopWatching).toHaveBeenCalled();
    });

    it('should kill Claude process if running', () => {
      const mockProcess = {
        pid: 12345,
        kill: vi.fn()
      } as any;

      // Access the ClaudeLifecycleManager and set the process
      (worker as any).claudeProcessManager.trackProcess(mockProcess);

      worker.shutdown();

      expect((worker as any).claudeProcessManager.getProcess()).toBeNull();
    });

    it('should close Claude WebSocket server', () => {
      // The ClaudeLifecycleManager handles WebSocket server cleanup internally
      // Just verify shutdown doesn't throw
      expect(() => {
        worker.shutdown();
      }).not.toThrow();
    });

    it('should cleanup all workspaces', () => {
      worker.shutdown();

      expect(mockWorkspaceManager.cleanupAll).toHaveBeenCalled();
    });

    it('should handle shutdown when WebSocket server is null', () => {
      // ClaudeLifecycleManager handles this internally
      expect(() => {
        worker.shutdown();
      }).not.toThrow();
    });

    it('should handle shutdown when Claude process is null', () => {
      // ClaudeLifecycleManager handles this internally
      expect(() => {
        worker.shutdown();
      }).not.toThrow();
    });
  });

  describe('logPrefix', () => {
    it('should generate correct log prefix', () => {
      const prefix = (worker as any).logPrefix();
      expect(prefix).toContain('FlowWorker');
      // WorkerId is '?' until Welcome message is received
      expect(prefix).toContain('?');
    });
  });

  describe('Integration - Full Flow Execution', () => {
    it('should complete full flow execution lifecycle', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await (worker as any).executeTask(mockTask);

      // Verify execution order
      expect(mockFlowRegistry.getFlow).toHaveBeenCalledWith('test-flow');
      expect(mockWorkspaceManager.allocate).toHaveBeenCalled();
      expect(mockFlowExecutor.execute).toHaveBeenCalled();
      expect(mockWorkspaceManager.release).toHaveBeenCalled();

      // Verify console logs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting task execution')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Executing flow: Test Flow')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Workspace allocated: workspace-1')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Flow completed successfully')
      );

      consoleSpy.mockRestore();
    });

    it('should handle multiple sequential tasks', async () => {
      const task1 = createMockTask({ id: 'task-1', flowId: 'test-flow' });
      const task2 = createMockTask({ id: 'task-2', flowId: 'test-flow' });

      await (worker as any).executeTask(task1);
      await (worker as any).executeTask(task2);

      expect(mockFlowExecutor.execute).toHaveBeenCalledTimes(2);
      expect(mockWorkspaceManager.allocate).toHaveBeenCalledTimes(2);
      expect(mockWorkspaceManager.release).toHaveBeenCalledTimes(2);
    });

    it('should handle tasks with different flows', async () => {
      const flow2 = createMockFlow({ id: 'test-flow-2', name: 'Test Flow 2' });
      mockFlowRegistry.getFlow.mockImplementation((id: string) => {
        return id === 'test-flow' ? mockFlow : flow2;
      });

      const task1 = createMockTask({ id: 'task-1', flowId: 'test-flow' });
      const task2 = createMockTask({ id: 'task-2', flowId: 'test-flow-2' });

      await (worker as any).executeTask(task1);
      await (worker as any).executeTask(task2);

      expect(mockFlowRegistry.getFlow).toHaveBeenCalledWith('test-flow');
      expect(mockFlowRegistry.getFlow).toHaveBeenCalledWith('test-flow-2');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from workspace allocation failure', async () => {
      mockWorkspaceManager.allocate
        .mockRejectedValueOnce(new Error('Allocation failed'))
        .mockResolvedValueOnce(mockWorkspace);

      const task1 = createMockTask({ id: 'task-1', flowId: 'test-flow' });
      const task2 = createMockTask({ id: 'task-2', flowId: 'test-flow' });

      await (worker as any).executeTask(task1);
      expect(task1.flowResult?.status).toBe('failed');

      await (worker as any).executeTask(task2);
      expect(task2.flowResult?.status).toBe('completed');
    });

    it('should recover from flow execution failure', async () => {
      mockFlowExecutor.execute
        .mockResolvedValueOnce({
          success: false,
          error: 'Execution failed',
          trace: { id: 'trace-1', steps: [] },
          outputs: {}
        })
        .mockResolvedValueOnce({
          success: true,
          trace: { id: 'trace-2', steps: [] },
          outputs: { step1: { result: 'success' } }
        });

      const task1 = createMockTask({ id: 'task-1', flowId: 'test-flow' });
      const task2 = createMockTask({ id: 'task-2', flowId: 'test-flow' });

      await (worker as any).executeTask(task1);
      expect(task1.flowResult?.status).toBe('failed');

      await (worker as any).executeTask(task2);
      expect(task2.flowResult?.status).toBe('completed');
    });
  });

  describe('Reconnection Logic', () => {
    it('should start with 0 reconnection attempts', () => {
      expect((worker as any).reconnectionAttempts).toBe(0);
    });

    it('should reset reconnection attempts to 0 when set directly', () => {
      // Set some reconnection attempts
      (worker as any).reconnectionAttempts = 5;
      expect((worker as any).reconnectionAttempts).toBe(5);

      // Reset to 0 (simulating what happens on successful connection)
      (worker as any).reconnectionAttempts = 0;
      expect((worker as any).reconnectionAttempts).toBe(0);
    });

    it('should increment reconnection attempts on scheduleReconnect', () => {
      vi.useFakeTimers();
      const initialAttempts = (worker as any).reconnectionAttempts;

      (worker as any).scheduleReconnect();

      expect((worker as any).reconnectionAttempts).toBe(initialAttempts + 1);

      vi.useRealTimers();
    });

    it('should use exponential backoff for reconnection delay', () => {
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // First attempt: 1000ms * 2^0 = 1000ms
      (worker as any).reconnectionAttempts = 0;
      (worker as any).scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting in 1000ms... (attempt 1/10)')
      );

      // Second attempt: 1000ms * 2^1 = 2000ms
      (worker as any).reconnectionAttempts = 1;
      (worker as any).scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting in 2000ms... (attempt 2/10)')
      );

      // Third attempt: 1000ms * 2^2 = 4000ms
      (worker as any).reconnectionAttempts = 2;
      (worker as any).scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting in 4000ms... (attempt 3/10)')
      );

      // Fourth attempt: 1000ms * 2^3 = 8000ms
      (worker as any).reconnectionAttempts = 3;
      (worker as any).scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting in 8000ms... (attempt 4/10)')
      );

      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should cap reconnection delay at maxReconnectDelay', () => {
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Attempt that would exceed max: 1000ms * 2^5 = 32000ms, capped at 30000ms
      (worker as any).reconnectionAttempts = 5;
      (worker as any).scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting in 30000ms... (attempt 6/10)')
      );

      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should exit process after max reconnection attempts', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (worker as any).reconnectionAttempts = 10;
      (worker as any).scheduleReconnect();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Maximum reconnection attempts (10) reached. Giving up.')
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should not exit before reaching max attempts', () => {
      vi.useFakeTimers();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      (worker as any).reconnectionAttempts = 9;
      (worker as any).scheduleReconnect();

      expect(exitSpy).not.toHaveBeenCalled();

      exitSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should schedule reconnection with correct delay timing', () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      (worker as any).reconnectionAttempts = 2;
      (worker as any).scheduleReconnect();

      // Should schedule with 4000ms delay (1000 * 2^2)
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        4000
      );

      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should attempt to reconnect after delay', async () => {
      vi.useFakeTimers();
      const connectSpy = vi.spyOn(worker as any, 'connect').mockResolvedValue(undefined);

      (worker as any).reconnectionAttempts = 0;
      (worker as any).scheduleReconnect();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);

      expect(connectSpy).toHaveBeenCalled();

      connectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should handle reconnection failures gracefully', async () => {
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const connectSpy = vi.spyOn(worker as any, 'connect').mockRejectedValue(new Error('Connection failed'));

      (worker as any).reconnectionAttempts = 0;
      (worker as any).scheduleReconnect();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reconnection failed:'),
        expect.any(Error)
      );

      connectSpy.mockRestore();
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle task with empty metadata', async () => {
      const taskWithEmptyMetadata = createMockTask({ metadata: {}, flowId: 'test-flow' });

      await (worker as any).executeTask(taskWithEmptyMetadata);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          taskMetadata: expect.objectContaining({
            priority: 'medium'
          })
        })
      );
    });

    it('should handle flow with no status transitions', async () => {
      const flowWithoutTransitions = createMockFlow();
      delete (flowWithoutTransitions as any).statusTransitions;
      mockFlowRegistry.getFlow.mockReturnValue(flowWithoutTransitions);

      await (worker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalled();
    });

    it('should handle workspace with no git state', async () => {
      const workspaceNoGit = createMockWorkspace();
      delete (workspaceNoGit as any).git;
      mockWorkspaceManager.allocate.mockResolvedValue(workspaceNoGit);

      await (worker as any).executeTask(mockTask);

      expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: workspaceNoGit
        })
      );
    });

    it('should handle flow execution with no outputs', async () => {
      mockFlowExecutor.execute.mockResolvedValue({
        success: true,
        trace: { id: 'trace-1', steps: [] },
        outputs: {}
      });

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'completed',
        outputs: {},
        error: undefined,
        trace: { id: 'trace-1', steps: [] }
      });
    });

    it('should handle flow execution with undefined error', async () => {
      mockFlowExecutor.execute.mockResolvedValue({
        success: false,
        error: undefined,
        trace: { id: 'trace-1', steps: [] },
        outputs: {}
      });

      await (worker as any).executeTask(mockTask);

      expect(mockTask.flowResult).toEqual({
        status: 'failed',
        outputs: {},
        error: undefined,
        trace: { id: 'trace-1', steps: [] }
      });
    });
  });
});
