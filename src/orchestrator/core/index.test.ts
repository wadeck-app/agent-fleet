/**
 * Orchestrator Index Tests
 *
 * Tests for the main orchestrator entry point that coordinates all services.
 *
 * Note: The orchestrator module auto-starts when imported, so we focus on testing
 * the behavior of the orchestrator components and their interactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach, MockedObject } from 'vitest';
import { TaskManager } from './TaskManager.js';
import { RestAPI } from './RestAPI.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { FlowRegistry } from '../../flow/registry/FlowRegistry.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';
import { Logger } from '../../shared/Logger.js';

// Mock all dependencies
vi.mock('./TaskManager.js');
vi.mock('./RestAPI.js');
vi.mock('../websocket/WorkerWebSocketServer.js');
vi.mock('../../flow/registry/FlowRegistry.js');
vi.mock('../../flow/workspace/WorkspaceManager.js');
vi.mock('../../shared/Logger.js');
vi.mock('../ui.js', () => ({
  renderUI: vi.fn(() => ({
    unmount: vi.fn(),
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import the mocked renderUI
import { renderUI } from '../ui.js';

/**
 * Helper class to simulate the Orchestrator behavior
 * This allows us to test the orchestrator logic in isolation
 */
class TestableOrchestrator {
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private restAPI: RestAPI;
  private flowRegistry: FlowRegistry;
  private workspaceManager: WorkspaceManager;
  private uiInstance: any;

  constructor(projectRoot: string = '/test/project/root') {
    Logger.log('[Orchestrator] Initializing...');

    this.taskManager = new TaskManager();
    this.wsServer = new WorkerWebSocketServer(this.taskManager, 3738);
    this.flowRegistry = new FlowRegistry(projectRoot);
    this.workspaceManager = new WorkspaceManager(projectRoot);

    this.restAPI = new RestAPI(
      this.taskManager,
      this.wsServer,
      3737,
      this.flowRegistry,
      this.workspaceManager
    );
  }

  private async loadFlows(): Promise<void> {
    try {
      await this.flowRegistry.loadProjectFlows();
      const flowIds = this.flowRegistry.getFlowIds();
      Logger.log(`[Orchestrator] Loaded ${flowIds.length} flows: ${flowIds.join(', ')}`);
    } catch (error) {
      Logger.error('[Orchestrator] Failed to load flows:', error);
    }
  }

  async start(): Promise<void> {
    process.title = 'Orchestrator';

    await this.loadFlows();
    this.flowRegistry.startWatching();
    await this.restAPI.start();

    this.uiInstance = renderUI(this.taskManager, this.wsServer);
  }

  async stop(): Promise<void> {
    if (this.uiInstance) {
      this.uiInstance.unmount();
    }

    Logger.log('[Orchestrator] Shutting down...');

    this.flowRegistry.stopWatching();
    await this.restAPI.stop();
    await this.wsServer.stop();
    Logger.log('[Orchestrator] Stopped');
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  getWsServer(): WorkerWebSocketServer {
    return this.wsServer;
  }

  getRestAPI(): RestAPI {
    return this.restAPI;
  }

  getFlowRegistry(): FlowRegistry {
    return this.flowRegistry;
  }

  getWorkspaceManager(): WorkspaceManager {
    return this.workspaceManager;
  }
}

describe('Orchestrator', () => {
  let orchestrator: TestableOrchestrator;
  let mockTaskManager: MockedObject<TaskManager>;
  let mockRestAPI: MockedObject<RestAPI>;
  let mockWsServer: MockedObject<WorkerWebSocketServer>;
  let mockFlowRegistry: MockedObject<FlowRegistry>;
  let mockWorkspaceManager: MockedObject<WorkspaceManager>;
  let mockRenderUI: ReturnType<typeof renderUI>;

  // Store original process properties
  let originalTitle: string;
  let originalCwd: () => string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store and mock process properties
    originalTitle = process.title;
    originalCwd = process.cwd;
    process.cwd = vi.fn(() => '/test/project/root');

    // Mock Logger
    vi.mocked(Logger.log).mockImplementation(() => {});
    vi.mocked(Logger.error).mockImplementation(() => {});

    // Mock TaskManager
    mockTaskManager = {
      createTask: vi.fn(),
      getStats: vi.fn().mockReturnValue({ total: 0, byStatus: {} }),
      getAllTasks: vi.fn().mockReturnValue([]),
    } as any;
    vi.mocked(TaskManager).mockImplementation(function(this: any) {
      return mockTaskManager;
    } as any);

    // Mock RestAPI
    mockRestAPI = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    } as any;
    vi.mocked(RestAPI).mockImplementation(function(this: any) {
      return mockRestAPI;
    } as any);

    // Mock WorkerWebSocketServer
    mockWsServer = {
      stop: vi.fn().mockResolvedValue(undefined),
      getWorkers: vi.fn().mockReturnValue([]),
    } as any;
    vi.mocked(WorkerWebSocketServer).mockImplementation(function(this: any) {
      return mockWsServer;
    } as any);

    // Mock FlowRegistry
    mockFlowRegistry = {
      loadProjectFlows: vi.fn().mockResolvedValue(undefined),
      getFlowIds: vi.fn().mockReturnValue([]),
      startWatching: vi.fn(),
      stopWatching: vi.fn(),
      getAllFlows: vi.fn().mockReturnValue([]),
    } as any;
    vi.mocked(FlowRegistry).mockImplementation(function(this: any) {
      return mockFlowRegistry;
    } as any);

    // Mock WorkspaceManager
    mockWorkspaceManager = {
      getAllWorkspaces: vi.fn().mockReturnValue([]),
      cleanupAll: vi.fn().mockResolvedValue(undefined),
    } as any;
    vi.mocked(WorkspaceManager).mockImplementation(function(this: any) {
      return mockWorkspaceManager;
    } as any);

    // Mock renderUI
    mockRenderUI = {
      unmount: vi.fn(),
      waitUntilExit: vi.fn().mockResolvedValue(undefined),
    } as any;
    vi.mocked(renderUI).mockReturnValue(mockRenderUI);
  });

  afterEach(async () => {
    // Restore process properties
    process.title = originalTitle;
    process.cwd = originalCwd;

    // Clean up orchestrator if it exists
    if (orchestrator) {
      try {
        await orchestrator.stop();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Orchestrator Class - Constructor', () => {
    it('should initialize all services in correct order', () => {
      orchestrator = new TestableOrchestrator();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Initializing...');
      expect(TaskManager).toHaveBeenCalled();
      expect(WorkerWebSocketServer).toHaveBeenCalledWith(mockTaskManager, 3738);
      expect(FlowRegistry).toHaveBeenCalledWith('/test/project/root');
      expect(WorkspaceManager).toHaveBeenCalledWith('/test/project/root');
      expect(RestAPI).toHaveBeenCalledWith(
        mockTaskManager,
        mockWsServer,
        3737,
        mockFlowRegistry,
        mockWorkspaceManager
      );
    });

    it('should create TaskManager before WebSocket server', () => {
      orchestrator = new TestableOrchestrator();

      const taskManagerCallOrder = vi.mocked(TaskManager).mock.invocationCallOrder[0];
      const wsServerCallOrder = vi.mocked(WorkerWebSocketServer).mock.invocationCallOrder[0];

      expect(taskManagerCallOrder).toBeLessThan(wsServerCallOrder);
    });

    it('should pass TaskManager to WebSocket server', () => {
      orchestrator = new TestableOrchestrator();

      expect(WorkerWebSocketServer).toHaveBeenCalledWith(
        mockTaskManager,
        3738
      );
    });

    it('should pass correct port numbers to servers', () => {
      orchestrator = new TestableOrchestrator();

      expect(WorkerWebSocketServer).toHaveBeenCalledWith(
        expect.anything(),
        3738
      );

      expect(RestAPI).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        3737,
        expect.anything(),
        expect.anything()
      );
    });

    it('should initialize FlowRegistry with project root', () => {
      orchestrator = new TestableOrchestrator();

      expect(FlowRegistry).toHaveBeenCalledWith('/test/project/root');
    });

    it('should initialize WorkspaceManager with project root', () => {
      orchestrator = new TestableOrchestrator();

      expect(WorkspaceManager).toHaveBeenCalledWith('/test/project/root');
    });

    it('should pass all dependencies to RestAPI', () => {
      orchestrator = new TestableOrchestrator();

      expect(RestAPI).toHaveBeenCalledWith(
        mockTaskManager,
        mockWsServer,
        3737,
        mockFlowRegistry,
        mockWorkspaceManager
      );
    });

    it('should log initialization message', () => {
      orchestrator = new TestableOrchestrator();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Initializing...');
    });

    it('should allow custom project root', () => {
      orchestrator = new TestableOrchestrator('/custom/root');

      expect(FlowRegistry).toHaveBeenCalledWith('/custom/root');
      expect(WorkspaceManager).toHaveBeenCalledWith('/custom/root');
    });
  });

  describe('Orchestrator Class - loadFlows', () => {
    it('should load project flows successfully during start', async () => {
      mockFlowRegistry.getFlowIds.mockReturnValue(['flow1', 'flow2', 'flow3']);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(mockFlowRegistry.loadProjectFlows).toHaveBeenCalled();
      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Loaded 3 flows: flow1, flow2, flow3');
    });

    it('should handle empty flow list', async () => {
      mockFlowRegistry.getFlowIds.mockReturnValue([]);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(mockFlowRegistry.loadProjectFlows).toHaveBeenCalled();
      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Loaded 0 flows: ');
    });

    it('should handle flow loading errors gracefully', async () => {
      const error = new Error('Failed to load flows');
      mockFlowRegistry.loadProjectFlows.mockRejectedValue(error);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(Logger.error).toHaveBeenCalledWith('[Orchestrator] Failed to load flows:', error);
    });

    it('should log loaded flows with names', async () => {
      mockFlowRegistry.getFlowIds.mockReturnValue(['simple-qa', 'dev-full']);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Loaded 2 flows: simple-qa, dev-full');
    });

    it('should continue startup even if flow loading fails', async () => {
      const error = new Error('File not found');
      mockFlowRegistry.loadProjectFlows.mockRejectedValue(error);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      // Should still start other services
      expect(mockFlowRegistry.startWatching).toHaveBeenCalled();
      expect(mockRestAPI.start).toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalledWith('[Orchestrator] Failed to load flows:', error);
    });
  });

  describe('Orchestrator Class - start', () => {
    it('should set process title to Orchestrator', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(process.title).toBe('Orchestrator');
    });

    it('should load flows before starting API', async () => {
      const callOrder: string[] = [];

      mockFlowRegistry.loadProjectFlows.mockImplementation(async () => {
        callOrder.push('loadFlows');
      });

      mockRestAPI.start.mockImplementation(async () => {
        callOrder.push('restAPI.start');
      });

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(callOrder).toEqual(['loadFlows', 'restAPI.start']);
    });

    it('should start watching flows after loading', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(mockFlowRegistry.startWatching).toHaveBeenCalled();
    });

    it('should start REST API', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(mockRestAPI.start).toHaveBeenCalled();
    });

    it('should render UI after starting services', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(renderUI).toHaveBeenCalledWith(mockTaskManager, mockWsServer);
    });

    it('should pass taskManager and wsServer to renderUI', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(renderUI).toHaveBeenCalledWith(mockTaskManager, mockWsServer);
    });

    it('should handle REST API start failure', async () => {
      const error = new Error('Port already in use');
      mockRestAPI.start.mockRejectedValue(error);

      orchestrator = new TestableOrchestrator();
      await expect(orchestrator.start()).rejects.toThrow('Port already in use');
    });

    it('should perform startup steps in correct order', async () => {
      const callOrder: string[] = [];

      mockFlowRegistry.loadProjectFlows.mockImplementation(async () => {
        callOrder.push('1-loadFlows');
      });

      mockFlowRegistry.startWatching.mockImplementation(() => {
        callOrder.push('2-startWatching');
      });

      mockRestAPI.start.mockImplementation(async () => {
        callOrder.push('3-restAPI.start');
      });

      vi.mocked(renderUI).mockImplementation(() => {
        callOrder.push('4-renderUI');
        return mockRenderUI;
      });

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(callOrder).toEqual([
        '1-loadFlows',
        '2-startWatching',
        '3-restAPI.start',
        '4-renderUI',
      ]);
    });
  });

  describe('Orchestrator Class - stop', () => {
    it('should unmount UI first', async () => {
      const callOrder: string[] = [];

      mockRenderUI.unmount = vi.fn(() => {
        callOrder.push('1-ui.unmount');
      });

      mockFlowRegistry.stopWatching = vi.fn(() => {
        callOrder.push('2-flowRegistry.stopWatching');
      });

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();

      mockRenderUI.unmount = vi.fn(() => {
        callOrder.push('1-ui.unmount');
      });

      mockFlowRegistry.stopWatching = vi.fn(() => {
        callOrder.push('2-flowRegistry.stopWatching');
      });

      await orchestrator.stop();

      expect(callOrder[0]).toBe('1-ui.unmount');
    });

    it('should log shutdown message', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Shutting down...');
    });

    it('should stop watching flows', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(mockFlowRegistry.stopWatching).toHaveBeenCalled();
    });

    it('should stop REST API', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(mockRestAPI.stop).toHaveBeenCalled();
    });

    it('should stop WebSocket server', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(mockWsServer.stop).toHaveBeenCalled();
    });

    it('should stop services in correct order (REST API before WebSocket)', async () => {
      const callOrder: string[] = [];

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();

      mockRestAPI.stop.mockImplementation(async () => {
        callOrder.push('restAPI.stop');
      });

      mockWsServer.stop.mockImplementation(async () => {
        callOrder.push('wsServer.stop');
      });

      await orchestrator.stop();

      expect(callOrder).toEqual(['restAPI.stop', 'wsServer.stop']);
    });

    it('should log final stopped message', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Stopped');
    });

    it('should handle REST API stop failure', async () => {
      const error = new Error('Failed to close server');
      mockRestAPI.stop.mockRejectedValue(error);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      await expect(orchestrator.stop()).rejects.toThrow('Failed to close server');
    });

    it('should handle WebSocket server stop failure', async () => {
      const error = new Error('Failed to close WebSocket connections');
      mockWsServer.stop.mockRejectedValue(error);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      await expect(orchestrator.stop()).rejects.toThrow('Failed to close WebSocket connections');
    });

    it('should handle UI unmount when UI is not initialized', async () => {
      orchestrator = new TestableOrchestrator();
      // Don't call start(), so UI is not initialized

      // Should not throw when UI is undefined
      await expect(orchestrator.stop()).resolves.not.toThrow();
    });

    it('should perform shutdown steps in correct order', async () => {
      const callOrder: string[] = [];

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();

      mockRenderUI.unmount = vi.fn(() => {
        callOrder.push('1-ui.unmount');
      });

      mockFlowRegistry.stopWatching = vi.fn(() => {
        callOrder.push('2-stopWatching');
      });

      mockRestAPI.stop.mockImplementation(async () => {
        callOrder.push('3-restAPI.stop');
      });

      mockWsServer.stop.mockImplementation(async () => {
        callOrder.push('4-wsServer.stop');
      });

      await orchestrator.stop();

      expect(callOrder).toEqual([
        '1-ui.unmount',
        '2-stopWatching',
        '3-restAPI.stop',
        '4-wsServer.stop',
      ]);
    });
  });

  describe('Service Integration', () => {
    it('should create TaskManager before other services', () => {
      orchestrator = new TestableOrchestrator();

      const taskManagerOrder = vi.mocked(TaskManager).mock.invocationCallOrder[0];
      const restAPIOrder = vi.mocked(RestAPI).mock.invocationCallOrder[0];
      const wsServerOrder = vi.mocked(WorkerWebSocketServer).mock.invocationCallOrder[0];

      expect(taskManagerOrder).toBeLessThan(restAPIOrder);
      expect(taskManagerOrder).toBeLessThan(wsServerOrder);
    });

    it('should create WebSocket server before REST API', () => {
      orchestrator = new TestableOrchestrator();

      const wsServerOrder = vi.mocked(WorkerWebSocketServer).mock.invocationCallOrder[0];
      const restAPIOrder = vi.mocked(RestAPI).mock.invocationCallOrder[0];

      expect(wsServerOrder).toBeLessThan(restAPIOrder);
    });

    it('should initialize FlowRegistry before REST API', () => {
      orchestrator = new TestableOrchestrator();

      const flowRegistryOrder = vi.mocked(FlowRegistry).mock.invocationCallOrder[0];
      const restAPIOrder = vi.mocked(RestAPI).mock.invocationCallOrder[0];

      expect(flowRegistryOrder).toBeLessThan(restAPIOrder);
    });

    it('should initialize WorkspaceManager before REST API', () => {
      orchestrator = new TestableOrchestrator();

      const workspaceManagerOrder = vi.mocked(WorkspaceManager).mock.invocationCallOrder[0];
      const restAPIOrder = vi.mocked(RestAPI).mock.invocationCallOrder[0];

      expect(workspaceManagerOrder).toBeLessThan(restAPIOrder);
    });

    it('should provide access to all services', () => {
      orchestrator = new TestableOrchestrator();

      expect(orchestrator.getTaskManager()).toBe(mockTaskManager);
      expect(orchestrator.getWsServer()).toBe(mockWsServer);
      expect(orchestrator.getRestAPI()).toBe(mockRestAPI);
      expect(orchestrator.getFlowRegistry()).toBe(mockFlowRegistry);
      expect(orchestrator.getWorkspaceManager()).toBe(mockWorkspaceManager);
    });
  });

  describe('Error Handling', () => {
    it('should handle TaskManager initialization failure', () => {
      const error = new Error('Storage initialization failed');
      vi.mocked(TaskManager).mockImplementation(function(this: any) {
        throw error;
      } as any);

      expect(() => new TestableOrchestrator()).toThrow('Storage initialization failed');
    });

    it('should handle WebSocket server initialization failure', () => {
      const error = new Error('Port 3738 is already in use');
      vi.mocked(WorkerWebSocketServer).mockImplementation(function(this: any) {
        throw error;
      } as any);

      expect(() => new TestableOrchestrator()).toThrow('Port 3738 is already in use');
    });

    it('should handle REST API initialization failure', () => {
      const error = new Error('Port 3737 is already in use');
      vi.mocked(RestAPI).mockImplementation(function(this: any) {
        throw error;
      } as any);

      expect(() => new TestableOrchestrator()).toThrow('Port 3737 is already in use');
    });

    it('should handle FlowRegistry initialization failure', () => {
      const error = new Error('Invalid project root');
      vi.mocked(FlowRegistry).mockImplementation(function(this: any) {
        throw error;
      } as any);

      expect(() => new TestableOrchestrator()).toThrow('Invalid project root');
    });

    it('should handle WorkspaceManager initialization failure', () => {
      const error = new Error('Cannot create workspace directory');
      vi.mocked(WorkspaceManager).mockImplementation(function(this: any) {
        throw error;
      } as any);

      expect(() => new TestableOrchestrator()).toThrow('Cannot create workspace directory');
    });
  });

  describe('Flow Management', () => {
    it('should load multiple flows successfully during start', async () => {
      mockFlowRegistry.getFlowIds.mockReturnValue([
        'simple-qa',
        'dev-full',
        'custom-flow',
      ]);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(mockFlowRegistry.loadProjectFlows).toHaveBeenCalled();
      expect(Logger.log).toHaveBeenCalledWith(
        '[Orchestrator] Loaded 3 flows: simple-qa, dev-full, custom-flow'
      );
    });

    it('should start flow watching during startup', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(mockFlowRegistry.startWatching).toHaveBeenCalled();
    });

    it('should stop flow watching during shutdown', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(mockFlowRegistry.stopWatching).toHaveBeenCalled();
    });
  });

  describe('UI Management', () => {
    it('should render UI with correct dependencies', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(renderUI).toHaveBeenCalledWith(mockTaskManager, mockWsServer);
    });

    it('should store UI instance for cleanup', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(renderUI).toHaveBeenCalled();
      const uiInstance = vi.mocked(renderUI).mock.results[0].value;
      expect(uiInstance).toHaveProperty('unmount');
    });

    it('should unmount UI on stop', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(mockRenderUI.unmount).toHaveBeenCalled();
    });
  });

  describe('Logging', () => {
    it('should log initialization', () => {
      orchestrator = new TestableOrchestrator();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Initializing...');
    });

    it('should log loaded flows count', async () => {
      mockFlowRegistry.getFlowIds.mockReturnValue(['flow1', 'flow2']);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Loaded 2 flows: flow1, flow2');
    });

    it('should log shutdown message', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Shutting down...');
    });

    it('should log stopped message', async () => {
      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      vi.clearAllMocks();
      await orchestrator.stop();

      expect(Logger.log).toHaveBeenCalledWith('[Orchestrator] Stopped');
    });

    it('should log errors during flow loading', async () => {
      const error = new Error('Invalid YAML');
      mockFlowRegistry.loadProjectFlows.mockRejectedValue(error);

      orchestrator = new TestableOrchestrator();
      await orchestrator.start();

      expect(Logger.error).toHaveBeenCalledWith('[Orchestrator] Failed to load flows:', error);
    });
  });
});
