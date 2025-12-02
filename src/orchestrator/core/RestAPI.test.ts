/**
 * RestAPI Tests
 *
 * Comprehensive unit tests for the REST API endpoints.
 * Tests all HTTP endpoints with success and error cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { RestAPI } from './RestAPI.js';
import { TaskManager } from './TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { FlowRegistry } from '../../flow/registry/FlowRegistry.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';
import { Task, TaskStatus, WorkerType, WorkerInfo } from '../../shared/types.js';
import { Logger } from '../../shared/Logger.js';

// Mock all dependencies
vi.mock('./TaskManager.js');
vi.mock('../websocket/WorkerWebSocketServer.js');
vi.mock('../../flow/registry/FlowRegistry.js');
vi.mock('../../flow/workspace/WorkspaceManager.js');
vi.mock('../../shared/Logger.js');

describe('RestAPI', () => {
  let api: RestAPI;
  let mockTaskManager: TaskManager;
  let mockWsServer: WorkerWebSocketServer;
  let mockFlowRegistry: FlowRegistry;
  let mockWorkspaceManager: WorkspaceManager;
  let app: any;

  // Helper to create a mock task
  const createMockTask = (id: string, overrides?: Partial<Task>): Task => ({
    id,
    description: 'Test task',
    status: TaskStatus.BACKLOG,
    priority: 'medium',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    assignedTo: null,
    comments: [],
    metadata: {},
    history: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock TaskManager
    mockTaskManager = new TaskManager();
    vi.mocked(mockTaskManager.createTask).mockReturnValue(createMockTask('task-1'));
    vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([]);
    vi.mocked(mockTaskManager.getTasksByStatus).mockReturnValue([]);
    vi.mocked(mockTaskManager.getTask).mockReturnValue(undefined);
    vi.mocked(mockTaskManager.updateTaskStatus).mockImplementation(() => {});
    vi.mocked(mockTaskManager.addComment).mockImplementation(() => {});
    vi.mocked(mockTaskManager.deleteTask).mockReturnValue(false);
    vi.mocked(mockTaskManager.clearAllTasks).mockReturnValue(0);
    vi.mocked(mockTaskManager.getStats).mockReturnValue({
      total: 0,
      byStatus: {},
    });

    // Mock WorkerWebSocketServer
    mockWsServer = new WorkerWebSocketServer(mockTaskManager);
    vi.mocked(mockWsServer.getWorkers).mockReturnValue([]);
    vi.mocked(mockWsServer.getPort).mockReturnValue(3738);
    vi.mocked(mockWsServer.tryAssignTasksToIdleWorkers).mockImplementation(() => {});

    // Mock FlowRegistry
    mockFlowRegistry = new FlowRegistry('/test/project');
    vi.mocked(mockFlowRegistry.hasFlow).mockReturnValue(false);
    vi.mocked(mockFlowRegistry.getAllFlows).mockReturnValue([]);
    vi.mocked(mockFlowRegistry.getFlow).mockReturnValue(undefined);

    // Mock WorkspaceManager
    mockWorkspaceManager = new WorkspaceManager('/tmp/workspaces');
    vi.mocked(mockWorkspaceManager.getAllWorkspaces).mockReturnValue([]);
    vi.mocked(mockWorkspaceManager.getWorkspace).mockReturnValue(undefined);

    // Mock Logger
    vi.mocked(Logger.log).mockImplementation(() => {});
    vi.mocked(Logger.error).mockImplementation(() => {});

    // Create API instance without flow registry by default
    api = new RestAPI(mockTaskManager, mockWsServer, 3737);
    app = (api as any).app;
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('should always return 200 regardless of system state', async () => {
      // Simulate error in TaskManager
      vi.mocked(mockTaskManager.getAllTasks).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /stats', () => {
    it('should return statistics with no workers or tasks', async () => {
      const response = await request(app).get('/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        restPort: 3737,
        wsPort: 3738,
        workers: 0,
        workersList: [],
        tasks: {
          total: 0,
          byStatus: {},
        },
      });
    });

    it('should return statistics with workers and tasks', async () => {
      const mockWorkers: WorkerInfo[] = [
        {
          id: 'worker-1',
          type: WorkerType.DEV,
          taskId: 'task-1',
          connectedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'worker-2',
          type: WorkerType.REVIEWER,
          taskId: null,
          connectedAt: '2024-01-01T00:01:00.000Z',
        },
      ];

      vi.mocked(mockWsServer.getWorkers).mockReturnValue(mockWorkers);
      vi.mocked(mockTaskManager.getStats).mockReturnValue({
        total: 5,
        byStatus: {
          [TaskStatus.BACKLOG]: 2,
          [TaskStatus.IN_PROGRESS]: 3,
        },
      });

      const response = await request(app).get('/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        restPort: 3737,
        wsPort: 3738,
        workers: 2,
        workersList: mockWorkers,
        tasks: {
          total: 5,
          byStatus: {
            [TaskStatus.BACKLOG]: 2,
            [TaskStatus.IN_PROGRESS]: 3,
          },
        },
      });
    });
  });

  describe('POST /tasks', () => {
    it('should create a task with description only', async () => {
      const mockTask = createMockTask('task-1', { description: 'New task' });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({ description: 'New task' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockTask);
      expect(mockTaskManager.createTask).toHaveBeenCalledWith('New task', {});
      expect(mockWsServer.tryAssignTasksToIdleWorkers).toHaveBeenCalled();
    });

    it('should create a task with priority and metadata', async () => {
      const mockTask = createMockTask('task-2', {
        description: 'High priority task',
        priority: 'high',
      });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({
          description: 'High priority task',
          priority: 'high',
          metadata: { customField: 'value' },
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockTask);
      expect(mockTaskManager.createTask).toHaveBeenCalledWith('High priority task', {
        priority: 'high',
        customField: 'value',
      });
    });

    it('should create a task with flowId', async () => {
      // Create API with flow registry
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.hasFlow).mockReturnValue(true);
      const mockTask = createMockTask('task-3', {
        description: 'Flow task',
        flowId: 'test-flow',
      });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({
          description: 'Flow task',
          flowId: 'test-flow',
        });

      expect(response.status).toBe(201);
      expect(mockFlowRegistry.hasFlow).toHaveBeenCalledWith('test-flow');
      expect(response.body.flowId).toBe('test-flow');
    });

    it('should create a task with flowId and flowInputs', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.hasFlow).mockReturnValue(true);
      const mockTask = createMockTask('task-4', {
        description: 'Flow task with inputs',
        flowId: 'test-flow',
        flowInputs: { input1: 'value1' },
      });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({
          description: 'Flow task with inputs',
          flowId: 'test-flow',
          flowInputs: { input1: 'value1' },
        });

      expect(response.status).toBe(201);
      expect(response.body.flowId).toBe('test-flow');
      expect(response.body.flowInputs).toEqual({ input1: 'value1' });
    });

    it('should create a task with workspacePath', async () => {
      const mockTask = createMockTask('task-5', {
        description: 'Task with workspace',
        workspacePath: '/path/to/workspace',
      });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({
          description: 'Task with workspace',
          workspacePath: '/path/to/workspace',
        });

      expect(response.status).toBe(201);
      expect(response.body.workspacePath).toBe('/path/to/workspace');
    });

    it('should return 400 when description is missing', async () => {
      const response = await request(app)
        .post('/tasks')
        .send({ priority: 'high' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Description is required' });
      expect(mockTaskManager.createTask).not.toHaveBeenCalled();
    });

    it('should return 400 when description is empty string', async () => {
      const response = await request(app)
        .post('/tasks')
        .send({ description: '' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Description is required' });
    });

    it('should return 400 when flowId does not exist', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.hasFlow).mockReturnValue(false);

      const response = await request(app)
        .post('/tasks')
        .send({
          description: 'Task with invalid flow',
          flowId: 'non-existent-flow',
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Flow 'non-existent-flow' not found" });
      expect(mockTaskManager.createTask).not.toHaveBeenCalled();
    });

    it('should return 500 when task creation fails', async () => {
      vi.mocked(mockTaskManager.createTask).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .post('/tasks')
        .send({ description: 'Task that will fail' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('GET /tasks', () => {
    it('should return all tasks', async () => {
      const mockTasks = [
        createMockTask('task-1'),
        createMockTask('task-2'),
        createMockTask('task-3'),
      ];
      vi.mocked(mockTaskManager.getAllTasks).mockReturnValue(mockTasks);

      const response = await request(app).get('/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTasks);
      expect(mockTaskManager.getAllTasks).toHaveBeenCalled();
    });

    it('should return empty array when no tasks', async () => {
      vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([]);

      const response = await request(app).get('/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should filter tasks by status', async () => {
      const mockTasks = [
        createMockTask('task-1', { status: TaskStatus.TODO }),
        createMockTask('task-2', { status: TaskStatus.TODO }),
      ];
      vi.mocked(mockTaskManager.getTasksByStatus).mockReturnValue(mockTasks);

      const response = await request(app).get('/tasks?status=todo');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTasks);
      expect(mockTaskManager.getTasksByStatus).toHaveBeenCalledWith(TaskStatus.TODO);
    });

    it('should filter tasks by in_progress status', async () => {
      const mockTasks = [
        createMockTask('task-1', { status: TaskStatus.IN_PROGRESS }),
      ];
      vi.mocked(mockTaskManager.getTasksByStatus).mockReturnValue(mockTasks);

      const response = await request(app).get('/tasks?status=in_progress');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTasks);
      expect(mockTaskManager.getTasksByStatus).toHaveBeenCalledWith(TaskStatus.IN_PROGRESS);
    });

    it('should return 500 when listing fails', async () => {
      vi.mocked(mockTaskManager.getAllTasks).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/tasks');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('GET /tasks/:id', () => {
    it('should return a specific task', async () => {
      const mockTask = createMockTask('task-1');
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get('/tasks/task-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTask);
      expect(mockTaskManager.getTask).toHaveBeenCalledWith('task-1');
    });

    it('should return 404 when task not found', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValue(undefined);

      const response = await request(app).get('/tasks/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Task not found' });
    });

    it('should return 500 when getting task fails', async () => {
      vi.mocked(mockTaskManager.getTask).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/tasks/task-1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('PATCH /tasks/:id/status', () => {
    it('should update task status', async () => {
      const mockTask = createMockTask('task-1', { status: TaskStatus.IN_PROGRESS });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app)
        .patch('/tasks/task-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTask);
      expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith('task-1', TaskStatus.IN_PROGRESS);
    });

    it('should update task to completed status', async () => {
      const mockTask = createMockTask('task-1', { status: TaskStatus.MERGED });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app)
        .patch('/tasks/task-1/status')
        .send({ status: 'merged' });

      expect(response.status).toBe(200);
      expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith('task-1', TaskStatus.MERGED);
    });

    it('should return 400 when status is missing', async () => {
      const response = await request(app)
        .patch('/tasks/task-1/status')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Status is required' });
      expect(mockTaskManager.updateTaskStatus).not.toHaveBeenCalled();
    });

    it('should return 400 when status is null', async () => {
      const response = await request(app)
        .patch('/tasks/task-1/status')
        .send({ status: null });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Status is required' });
    });

    it('should return 500 when update fails', async () => {
      vi.mocked(mockTaskManager.updateTaskStatus).mockImplementation(() => {
        throw new Error('Task not found');
      });

      const response = await request(app)
        .patch('/tasks/task-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Task not found' });
    });
  });

  describe('POST /tasks/:id/comments', () => {
    it('should add a comment to task', async () => {
      const mockTask = createMockTask('task-1', {
        comments: [
          {
            timestamp: '2024-01-01T00:00:00.000Z',
            author: 'user-1',
            content: 'Test comment',
          },
        ],
      });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks/task-1/comments')
        .send({ author: 'user-1', content: 'Test comment' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTask);
      expect(mockTaskManager.addComment).toHaveBeenCalledWith('task-1', 'user-1', 'Test comment');
    });

    it('should return 400 when author is missing', async () => {
      const response = await request(app)
        .post('/tasks/task-1/comments')
        .send({ content: 'Test comment' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Author and content are required' });
      expect(mockTaskManager.addComment).not.toHaveBeenCalled();
    });

    it('should return 400 when content is missing', async () => {
      const response = await request(app)
        .post('/tasks/task-1/comments')
        .send({ author: 'user-1' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Author and content are required' });
      expect(mockTaskManager.addComment).not.toHaveBeenCalled();
    });

    it('should return 400 when both fields are missing', async () => {
      const response = await request(app)
        .post('/tasks/task-1/comments')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Author and content are required' });
    });

    it('should return 400 when fields are empty strings', async () => {
      const response = await request(app)
        .post('/tasks/task-1/comments')
        .send({ author: '', content: '' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Author and content are required' });
    });

    it('should return 500 when adding comment fails', async () => {
      vi.mocked(mockTaskManager.addComment).mockImplementation(() => {
        throw new Error('Task not found');
      });

      const response = await request(app)
        .post('/tasks/task-1/comments')
        .send({ author: 'user-1', content: 'Test comment' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Task not found' });
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('should delete a task', async () => {
      vi.mocked(mockTaskManager.deleteTask).mockReturnValue(true);

      const response = await request(app).delete('/tasks/task-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Task deleted successfully' });
      expect(mockTaskManager.deleteTask).toHaveBeenCalledWith('task-1');
    });

    it('should return 404 when task not found', async () => {
      vi.mocked(mockTaskManager.deleteTask).mockReturnValue(false);

      const response = await request(app).delete('/tasks/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Task not found' });
    });

    it('should return 500 when deletion fails', async () => {
      vi.mocked(mockTaskManager.deleteTask).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).delete('/tasks/task-1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('DELETE /tasks', () => {
    it('should clear all tasks', async () => {
      vi.mocked(mockTaskManager.clearAllTasks).mockReturnValue(5);

      const response = await request(app).delete('/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Cleared 5 tasks' });
      expect(mockTaskManager.clearAllTasks).toHaveBeenCalled();
    });

    it('should clear zero tasks when none exist', async () => {
      vi.mocked(mockTaskManager.clearAllTasks).mockReturnValue(0);

      const response = await request(app).delete('/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Cleared 0 tasks' });
    });

    it('should return 500 when clearing fails', async () => {
      vi.mocked(mockTaskManager.clearAllTasks).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).delete('/tasks');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('GET /workers', () => {
    it('should return list of workers', async () => {
      const mockWorkers: WorkerInfo[] = [
        {
          id: 'worker-1',
          type: WorkerType.DEV,
          taskId: 'task-1',
          connectedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'worker-2',
          type: WorkerType.REVIEWER,
          taskId: null,
          connectedAt: '2024-01-01T00:01:00.000Z',
        },
      ];
      vi.mocked(mockWsServer.getWorkers).mockReturnValue(mockWorkers);

      const response = await request(app).get('/workers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockWorkers);
      expect(mockWsServer.getWorkers).toHaveBeenCalled();
    });

    it('should return empty array when no workers', async () => {
      vi.mocked(mockWsServer.getWorkers).mockReturnValue([]);

      const response = await request(app).get('/workers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 500 when listing workers fails', async () => {
      vi.mocked(mockWsServer.getWorkers).mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      const response = await request(app).get('/workers');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'WebSocket error' });
    });
  });

  describe('GET /flows', () => {
    it('should return 503 when flow registry not available', async () => {
      const response = await request(app).get('/flows');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Flow registry not available' });
    });

    it('should return list of flows when registry available', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      const mockFlows = [
        {
          id: 'flow-1',
          name: 'Test Flow 1',
          description: 'First test flow',
          workspace: { mode: 'isolated' as const, gitStrategy: 'main-only' as const, reusePolicy: 'never' as const },
          inputs: {},
          steps: [],
        },
        {
          id: 'flow-2',
          name: 'Test Flow 2',
          description: 'Second test flow',
          workspace: { mode: 'shared' as const, gitStrategy: 'main-only' as const, reusePolicy: 'always' as const },
          inputs: {},
          steps: [],
        },
      ];
      vi.mocked(mockFlowRegistry.getAllFlows).mockReturnValue(mockFlows);

      const response = await request(app).get('/flows');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockFlows);
      expect(mockFlowRegistry.getAllFlows).toHaveBeenCalled();
    });

    it('should return empty array when no flows', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.getAllFlows).mockReturnValue([]);

      const response = await request(app).get('/flows');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 500 when listing flows fails', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.getAllFlows).mockImplementation(() => {
        throw new Error('Registry error');
      });

      const response = await request(app).get('/flows');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Registry error' });
    });
  });

  describe('GET /flows/:id', () => {
    it('should return 503 when flow registry not available', async () => {
      const response = await request(app).get('/flows/flow-1');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Flow registry not available' });
    });

    it('should return a specific flow', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      const mockFlow = {
        id: 'flow-1',
        name: 'Test Flow',
        description: 'A test flow',
        workspace: { mode: 'isolated' as const, gitStrategy: 'main-only' as const, reusePolicy: 'never' as const },
        inputs: { param1: 'string' as const },
        steps: [],
      };
      vi.mocked(mockFlowRegistry.getFlow).mockReturnValue(mockFlow);

      const response = await request(app).get('/flows/flow-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockFlow);
      expect(mockFlowRegistry.getFlow).toHaveBeenCalledWith('flow-1');
    });

    it('should return 404 when flow not found', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.getFlow).mockReturnValue(undefined);

      const response = await request(app).get('/flows/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Flow not found' });
    });

    it('should return 500 when getting flow fails', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockFlowRegistry);
      app = (api as any).app;

      vi.mocked(mockFlowRegistry.getFlow).mockImplementation(() => {
        throw new Error('Registry error');
      });

      const response = await request(app).get('/flows/flow-1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Registry error' });
    });
  });

  describe('GET /tasks/:id/trace', () => {
    it('should return task execution trace', async () => {
      const mockTask = createMockTask('task-1', {
        flowId: 'test-flow',
        flowResult: {
          status: 'completed',
          outputs: { result: 'success' },
          trace: [
            { stepId: 'step1', status: 'completed', duration: 100 },
            { stepId: 'step2', status: 'completed', duration: 200 },
          ],
        },
      });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get('/tasks/task-1/trace');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        taskId: 'task-1',
        flowId: 'test-flow',
        status: 'completed',
        trace: [
          { stepId: 'step1', status: 'completed', duration: 100 },
          { stepId: 'step2', status: 'completed', duration: 200 },
        ],
        outputs: { result: 'success' },
        error: undefined,
      });
    });

    it('should return task trace with error', async () => {
      const mockTask = createMockTask('task-1', {
        flowId: 'test-flow',
        flowResult: {
          status: 'failed',
          error: 'Step failed',
          trace: [
            { stepId: 'step1', status: 'completed', duration: 100 },
            { stepId: 'step2', status: 'failed', error: 'Step failed' },
          ],
        },
      });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get('/tasks/task-1/trace');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('failed');
      expect(response.body.error).toBe('Step failed');
    });

    it('should return 404 when task not found', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValue(undefined);

      const response = await request(app).get('/tasks/non-existent/trace');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Task not found' });
    });

    it('should return 404 when task has no flowResult', async () => {
      const mockTask = createMockTask('task-1');
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get('/tasks/task-1/trace');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No execution trace available for this task' });
    });

    it('should return 404 when task has flowResult but no trace', async () => {
      const mockTask = createMockTask('task-1', {
        flowResult: {
          status: 'completed',
          outputs: {},
        },
      });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get('/tasks/task-1/trace');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No execution trace available for this task' });
    });

    it('should return 500 when getting trace fails', async () => {
      vi.mocked(mockTaskManager.getTask).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/tasks/task-1/trace');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('GET /workspaces', () => {
    it('should return 503 when workspace manager not available', async () => {
      const response = await request(app).get('/workspaces');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Workspace manager not available' });
    });

    it('should return list of workspaces when manager available', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, null, mockWorkspaceManager);
      app = (api as any).app;

      const mockWorkspaces = [
        {
          id: 'ws-1',
          path: '/tmp/workspaces/ws-1',
          taskId: 'task-1',
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'ws-2',
          path: '/tmp/workspaces/ws-2',
          taskId: 'task-2',
          status: 'active',
          createdAt: '2024-01-01T00:01:00.000Z',
        },
      ];
      vi.mocked(mockWorkspaceManager.getAllWorkspaces).mockReturnValue(mockWorkspaces as any);

      const response = await request(app).get('/workspaces');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockWorkspaces);
      expect(mockWorkspaceManager.getAllWorkspaces).toHaveBeenCalled();
    });

    it('should return empty array when no workspaces', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, null, mockWorkspaceManager);
      app = (api as any).app;

      vi.mocked(mockWorkspaceManager.getAllWorkspaces).mockReturnValue([]);

      const response = await request(app).get('/workspaces');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 500 when listing workspaces fails', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, null, mockWorkspaceManager);
      app = (api as any).app;

      vi.mocked(mockWorkspaceManager.getAllWorkspaces).mockImplementation(() => {
        throw new Error('Workspace error');
      });

      const response = await request(app).get('/workspaces');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Workspace error' });
    });
  });

  describe('GET /workspaces/:id', () => {
    it('should return 503 when workspace manager not available', async () => {
      const response = await request(app).get('/workspaces/ws-1');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Workspace manager not available' });
    });

    it('should return a specific workspace', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, null, mockWorkspaceManager);
      app = (api as any).app;

      const mockWorkspace = {
        id: 'ws-1',
        path: '/tmp/workspaces/ws-1',
        taskId: 'task-1',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        gitBranch: 'feature/test',
      };
      vi.mocked(mockWorkspaceManager.getWorkspace).mockReturnValue(mockWorkspace as any);

      const response = await request(app).get('/workspaces/ws-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockWorkspace);
      expect(mockWorkspaceManager.getWorkspace).toHaveBeenCalledWith('ws-1');
    });

    it('should return 404 when workspace not found', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, null, mockWorkspaceManager);
      app = (api as any).app;

      vi.mocked(mockWorkspaceManager.getWorkspace).mockReturnValue(undefined);

      const response = await request(app).get('/workspaces/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Workspace not found' });
    });

    it('should return 500 when getting workspace fails', async () => {
      api = new RestAPI(mockTaskManager, mockWsServer, 3737, null, mockWorkspaceManager);
      app = (api as any).app;

      vi.mocked(mockWorkspaceManager.getWorkspace).mockImplementation(() => {
        throw new Error('Workspace error');
      });

      const response = await request(app).get('/workspaces/ws-1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Workspace error' });
    });
  });

  describe('Middleware', () => {
    it('should parse JSON request bodies', async () => {
      const mockTask = createMockTask('task-1');
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ description: 'Test task' }));

      expect(response.status).toBe(201);
      expect(mockTaskManager.createTask).toHaveBeenCalled();
    });

    it('should log API requests', async () => {
      await request(app).get('/health');

      expect(Logger.log).toHaveBeenCalledWith('[API] GET /health');
    });

    it('should log POST requests', async () => {
      const mockTask = createMockTask('task-1');
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      await request(app)
        .post('/tasks')
        .send({ description: 'Test' });

      expect(Logger.log).toHaveBeenCalledWith('[API] POST /tasks');
    });
  });

  describe('Edge Cases', () => {
    it('should handle task with all optional fields populated', async () => {
      const complexTask = createMockTask('task-1', {
        description: 'Complex task',
        priority: 'urgent',
        status: TaskStatus.IN_PROGRESS,
        flowId: 'test-flow',
        flowInputs: { input1: 'value1', input2: 'value2' },
        workspacePath: '/path/to/workspace',
        assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
        comments: [
          { timestamp: '2024-01-01T00:00:00.000Z', author: 'user-1', content: 'Comment 1' },
          { timestamp: '2024-01-01T00:01:00.000Z', author: 'user-2', content: 'Comment 2' },
        ],
        metadata: { customField1: 'value1', customField2: 'value2' },
        flowResult: {
          status: 'completed',
          outputs: { result: 'success' },
          trace: [{ stepId: 'step1', status: 'completed' }],
        },
      });
      vi.mocked(mockTaskManager.getTask).mockReturnValue(complexTask);

      const response = await request(app).get('/tasks/task-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(complexTask);
    });

    it('should handle special characters in task description', async () => {
      const mockTask = createMockTask('task-1', {
        description: 'Task with "quotes", <tags>, & symbols!',
      });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({ description: 'Task with "quotes", <tags>, & symbols!' });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe('Task with "quotes", <tags>, & symbols!');
    });

    it('should handle very long task descriptions', async () => {
      const longDescription = 'A'.repeat(10000);
      const mockTask = createMockTask('task-1', { description: longDescription });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({ description: longDescription });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe(longDescription);
    });

    it('should handle unicode characters in descriptions', async () => {
      const unicodeDesc = 'Task with 中文, العربية, Emoji 🚀';
      const mockTask = createMockTask('task-1', { description: unicodeDesc });
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({ description: unicodeDesc });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe(unicodeDesc);
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await request(app)
        .post('/tasks')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle missing Content-Type header', async () => {
      const mockTask = createMockTask('task-1');
      vi.mocked(mockTaskManager.createTask).mockReturnValue(mockTask);

      const response = await request(app)
        .post('/tasks')
        .send({ description: 'Test task' });

      expect(response.status).toBe(201);
    });

    it('should handle numeric task IDs', async () => {
      const mockTask = createMockTask('12345');
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get('/tasks/12345');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('12345');
    });

    it('should handle task IDs with special characters', async () => {
      const taskId = 'task-with-dashes_and_underscores';
      const mockTask = createMockTask(taskId);
      vi.mocked(mockTaskManager.getTask).mockReturnValue(mockTask);

      const response = await request(app).get(`/tasks/${taskId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(taskId);
    });
  });
});
