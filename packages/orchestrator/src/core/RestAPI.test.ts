/**
 * RestAPI Tests
 *
 * Comprehensive unit tests for the REST API endpoints.
 * Tests all HTTP endpoints with success and error cases.
 */
import type { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager';
import { createMockTask as createMockTaskUtil } from 'orchestrator/test-utils/MockOrchestrator';
import { logger } from 'shared-common/logger';
import type { StateManager } from 'shared-orch-worker/StateManager';
import type { Task, WorkerInfo } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import request from 'supertest';
import { setupTest } from 'test-utils/helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UIClientHook } from '../ui-client/UIClientHook';
import { UIWebSocketServer } from '../websocket/UIWebSocketServer';
import type { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer';
import { RestAPI } from './RestAPI';
import type { TaskManager } from './TaskManager';

// Mock all dependencies
vi.mock('./TaskManager');
vi.mock('../websocket/WorkerWebSocketServer');
vi.mock('../websocket/UIWebSocketServer', () => ({
	UIWebSocketServer: vi.fn(function (this: any) {
		this.start = vi.fn();
		this.stop = vi.fn();
		this.handleConnection = vi.fn();
		this.getClientCount = vi.fn().mockReturnValue(0);
		this.isRunning = vi.fn().mockReturnValue(false);
	}),
}));
vi.mock('../ui-client/UIClientHook');
vi.mock('flow-engine/workspace/WorkspaceManager');
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger', () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe('RestAPI', () => {
	let api: RestAPI;
	let mockTaskManager: TaskManager;
	let mockWsServer: WorkerWebSocketServer;
	let mockWorkspaceManager: WorkspaceManager;
	let mockStateManager: StateManager;
	let mockConnectionManager: any;
	let mockFlowDiscoveryRegistry: any;
	let app: any;
	let cleanup: () => void;

	// Local helper to create tasks with flexible overrides (allows non-standard properties)
	const createMockTask = (id: string, overrides?: Partial<Task> & Record<string, any>): Task =>
		({
			...createMockTaskUtil({ id }),
			...overrides,
		}) as Task;

	beforeEach(() => {
		cleanup = setupTest();

		// Mock StateManager
		mockStateManager = {
			emitTaskCreated: vi.fn(),
			emitTaskUpdated: vi.fn(),
			emitTaskDeleted: vi.fn(),
			emitWorkerConnected: vi.fn(),
			emitWorkerDisconnected: vi.fn(),
			emitWorkerTaskAssigned: vi.fn(),
			emitWorkerTaskReleased: vi.fn(),
			emitLogMessage: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
			once: vi.fn(),
			emit: vi.fn(),
			removeAllListeners: vi.fn(),
		} as any;

		// Mock TaskManager
		mockTaskManager = {
			createTask: vi.fn().mockReturnValue(createMockTask('task-1')),
			getAllTasks: vi.fn().mockReturnValue([]),
			getTasksByStatus: vi.fn().mockReturnValue([]),
			getTask: vi.fn().mockReturnValue(undefined),
			updateTaskStatus: vi.fn().mockImplementation(() => {}),
			updateTask: vi.fn().mockResolvedValue(undefined),
			addComment: vi.fn().mockImplementation(() => {}),
			deleteTask: vi.fn().mockReturnValue(false),
			clearAllTasks: vi.fn().mockReturnValue(0),
			getStats: vi.fn().mockReturnValue({
				total: 0,
				byStatus: {},
			}),
		} as any;

		// Mock FlowDiscoveryRegistry
		mockFlowDiscoveryRegistry = {
			getAllProjects: vi.fn().mockReturnValue([]),
			getProjectFlows: vi.fn().mockReturnValue(undefined),
		};

		// Mock ConnectionManager
		mockConnectionManager = {
			getFlowDiscoveryRegistry: vi.fn().mockReturnValue(mockFlowDiscoveryRegistry),
		};

		// Mock WorkerWebSocketServer
		mockWsServer = {
			getWorkers: vi.fn().mockReturnValue([]),
			getPort: vi.fn().mockReturnValue(3738),
			getConnectionManager: vi.fn().mockReturnValue(mockConnectionManager),
			tryAssignTasksToIdleWorkers: vi.fn().mockImplementation(() => {}),
		} as any;

		// Mock WorkspaceManager
		mockWorkspaceManager = {
			getAllWorkspaces: vi.fn().mockReturnValue([]),
			getWorkspace: vi.fn().mockReturnValue(undefined),
		} as any;

		// Mock Logger static methods
		logger.info = vi.fn();
		logger.error = vi.fn();

		// Create API instance without workspace manager by default
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
			mockTaskManager.getAllTasks = vi.fn().mockImplementation(() => {
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
			expect(response.body).toEqual(
				expect.objectContaining({
					restPort: 3737,
					wsPort: 3738,
					workers: 0,
					workersList: [],
					tasks: {
						total: 0,
						byStatus: {},
					},
				})
			);
			expect(response.body.uptime).toBeGreaterThanOrEqual(0);
		});

		it('should return statistics with workers and tasks', async () => {
			const mockWorkers: WorkerInfo[] = [
				{
					id: 'worker-1',
					// type: WorkerType.DEV,
					taskId: 'task-1',
					connectedAt: '2024-01-01T00:00:00.000Z',
					taskStartedAt: '2024-01-01T00:00:00.000Z',
				},
				{
					id: 'worker-2',
					// type: WorkerType.REVIEWER,
					taskId: null,
					connectedAt: '2024-01-01T00:01:00.000Z',
					taskStartedAt: null,
				},
			];

			mockWsServer.getWorkers = vi.fn().mockReturnValue(mockWorkers);
			mockTaskManager.getStats = vi.fn().mockReturnValue({
				total: 5,
				byStatus: {
					[TaskStatus.BACKLOG]: 2,
					[TaskStatus.IN_PROGRESS]: 3,
				},
			});

			const response = await request(app).get('/stats');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(
				expect.objectContaining({
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
				})
			);
			expect(response.body.uptime).toBeGreaterThanOrEqual(0);
		});
	});

	describe('POST /tasks', () => {
		it('should create a task with description only', async () => {
			const mockTask = createMockTask('task-1', { description: 'New task' });
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).post('/tasks').send({ description: 'New task' });

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
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

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

		it('should create a task with flowId (no validation - workers handle this)', async () => {
			const mockTask = createMockTask('task-3', {
				description: 'Flow task',
				flowId: 'test-flow',
			});
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).post('/tasks').send({
				description: 'Flow task',
				flowId: 'test-flow',
			});

			expect(response.status).toBe(201);
			expect(response.body.flowId).toBe('test-flow');
			expect(mockTaskManager.updateTask).toHaveBeenCalled();
		});

		it('should create a task with flowId and flowInputs', async () => {
			const mockTask = createMockTask('task-4', {
				description: 'Flow task with inputs',
				flowId: 'test-flow',
				flowInputs: { input1: 'value1' },
			});
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

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
			expect(mockTaskManager.updateTask).toHaveBeenCalled();
		});

		it('should create a task with workspacePath', async () => {
			const mockTask = createMockTask('task-5', {
				description: 'Task with workspace',
				workspacePath: '/path/to/workspace',
			});
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).post('/tasks').send({
				description: 'Task with workspace',
				workspacePath: '/path/to/workspace',
			});

			expect(response.status).toBe(201);
			expect(response.body.workspacePath).toBe('/path/to/workspace');
		});

		it('should return 400 when description is missing', async () => {
			const response = await request(app).post('/tasks').send({ priority: 'high' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Description is required' });
			expect(mockTaskManager.createTask).not.toHaveBeenCalled();
		});

		it('should return 400 when description is empty string', async () => {
			const response = await request(app).post('/tasks').send({ description: '' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Description is required' });
		});

		it('should return 500 when task creation fails', async () => {
			mockTaskManager.createTask = vi.fn().mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await request(app).post('/tasks').send({ description: 'Task that will fail' });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: 'Database error' });
		});
	});

	describe('GET /tasks', () => {
		it('should return all tasks', async () => {
			const mockTasks = [createMockTask('task-1'), createMockTask('task-2'), createMockTask('task-3')];
			mockTaskManager.getAllTasks = vi.fn().mockReturnValue(mockTasks);

			const response = await request(app).get('/tasks');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTasks);
			expect(mockTaskManager.getAllTasks).toHaveBeenCalled();
		});

		it('should return empty array when no tasks', async () => {
			mockTaskManager.getAllTasks = vi.fn().mockReturnValue([]);

			const response = await request(app).get('/tasks');

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it('should filter tasks by status', async () => {
			const mockTasks = [
				createMockTask('task-1', { status: TaskStatus.TODO }),
				createMockTask('task-2', { status: TaskStatus.TODO }),
			];
			mockTaskManager.getTasksByStatus = vi.fn().mockReturnValue(mockTasks);

			const response = await request(app).get('/tasks?status=todo');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTasks);
			expect(mockTaskManager.getTasksByStatus).toHaveBeenCalledWith(TaskStatus.TODO);
		});

		it('should filter tasks by in_progress status', async () => {
			const mockTasks = [createMockTask('task-1', { status: TaskStatus.IN_PROGRESS })];
			mockTaskManager.getTasksByStatus = vi.fn().mockReturnValue(mockTasks);

			const response = await request(app).get('/tasks?status=in_progress');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTasks);
			expect(mockTaskManager.getTasksByStatus).toHaveBeenCalledWith(TaskStatus.IN_PROGRESS);
		});

		it('should return 500 when listing fails', async () => {
			mockTaskManager.getAllTasks = vi.fn().mockImplementation(() => {
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
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).get('/tasks/task-1');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTask);
			expect(mockTaskManager.getTask).toHaveBeenCalledWith('task-1');
		});

		it('should return 404 when task not found', async () => {
			mockTaskManager.getTask = vi.fn().mockReturnValue(undefined);

			const response = await request(app).get('/tasks/non-existent');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Task not found' });
		});

		it('should return 500 when getting task fails', async () => {
			mockTaskManager.getTask = vi.fn().mockImplementation(() => {
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
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).patch('/tasks/task-1/status').send({ status: 'in_progress' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTask);
			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith('task-1', TaskStatus.IN_PROGRESS);
		});

		it('should update task to completed status', async () => {
			const mockTask = createMockTask('task-1', { status: TaskStatus.MERGED });
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).patch('/tasks/task-1/status').send({ status: 'merged' });

			expect(response.status).toBe(200);
			expect(mockTaskManager.updateTaskStatus).toHaveBeenCalledWith('task-1', TaskStatus.MERGED);
		});

		it('should return 400 when status is missing', async () => {
			const response = await request(app).patch('/tasks/task-1/status').send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Status is required' });
			expect(mockTaskManager.updateTaskStatus).not.toHaveBeenCalled();
		});

		it('should return 400 when status is null', async () => {
			const response = await request(app).patch('/tasks/task-1/status').send({ status: null });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Status is required' });
		});

		it('should return 500 when update fails', async () => {
			mockTaskManager.updateTaskStatus = vi.fn().mockImplementation(() => {
				throw new Error('Task not found');
			});

			const response = await request(app).patch('/tasks/task-1/status').send({ status: 'in_progress' });

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
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app)
				.post('/tasks/task-1/comments')
				.send({ author: 'user-1', content: 'Test comment' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTask);
			expect(mockTaskManager.addComment).toHaveBeenCalledWith('task-1', 'user-1', 'Test comment');
		});

		it('should return 400 when author is missing', async () => {
			const response = await request(app).post('/tasks/task-1/comments').send({ content: 'Test comment' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Author and content are required' });
			expect(mockTaskManager.addComment).not.toHaveBeenCalled();
		});

		it('should return 400 when content is missing', async () => {
			const response = await request(app).post('/tasks/task-1/comments').send({ author: 'user-1' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Author and content are required' });
			expect(mockTaskManager.addComment).not.toHaveBeenCalled();
		});

		it('should return 400 when both fields are missing', async () => {
			const response = await request(app).post('/tasks/task-1/comments').send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Author and content are required' });
		});

		it('should return 400 when fields are empty strings', async () => {
			const response = await request(app).post('/tasks/task-1/comments').send({ author: '', content: '' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Author and content are required' });
		});

		it('should return 500 when adding comment fails', async () => {
			mockTaskManager.addComment = vi.fn().mockImplementation(() => {
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
			mockTaskManager.deleteTask = vi.fn().mockReturnValue(true);

			const response = await request(app).delete('/tasks/task-1');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: 'Task deleted successfully' });
			expect(mockTaskManager.deleteTask).toHaveBeenCalledWith('task-1');
		});

		it('should return 404 when task not found', async () => {
			mockTaskManager.deleteTask = vi.fn().mockReturnValue(false);

			const response = await request(app).delete('/tasks/non-existent');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Task not found' });
		});

		it('should return 500 when deletion fails', async () => {
			mockTaskManager.deleteTask = vi.fn().mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await request(app).delete('/tasks/task-1');

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: 'Database error' });
		});
	});

	describe('DELETE /tasks', () => {
		it('should clear all tasks', async () => {
			mockTaskManager.clearAllTasks = vi.fn().mockReturnValue(5);

			const response = await request(app).delete('/tasks');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: 'Cleared 5 tasks' });
			expect(mockTaskManager.clearAllTasks).toHaveBeenCalled();
		});

		it('should clear zero tasks when none exist', async () => {
			mockTaskManager.clearAllTasks = vi.fn().mockReturnValue(0);

			const response = await request(app).delete('/tasks');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: 'Cleared 0 tasks' });
		});

		it('should return 500 when clearing fails', async () => {
			mockTaskManager.clearAllTasks = vi.fn().mockImplementation(() => {
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
					// type: WorkerType.DEV,
					taskId: 'task-1',
					connectedAt: '2024-01-01T00:00:00.000Z',
					taskStartedAt: '2024-01-01T00:00:00.000Z',
				},
				{
					id: 'worker-2',
					// type: WorkerType.REVIEWER,
					taskId: null,
					connectedAt: '2024-01-01T00:01:00.000Z',
					taskStartedAt: null,
				},
			];
			mockWsServer.getWorkers = vi.fn().mockReturnValue(mockWorkers);

			const response = await request(app).get('/workers');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockWorkers);
			expect(mockWsServer.getWorkers).toHaveBeenCalled();
		});

		it('should return empty array when no workers', async () => {
			mockWsServer.getWorkers = vi.fn().mockReturnValue([]);

			const response = await request(app).get('/workers');

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it('should return 500 when listing workers fails', async () => {
			mockWsServer.getWorkers = vi.fn().mockImplementation(() => {
				throw new Error('WebSocket error');
			});

			const response = await request(app).get('/workers');

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: 'WebSocket error' });
		});
	});

	describe('GET /flows', () => {
		it('should return empty object when no projects registered', async () => {
			mockFlowDiscoveryRegistry.getAllProjects.mockReturnValue([]);

			const response = await request(app).get('/flows');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({});
		});

		it('should return flows by project from discovery registry', async () => {
			mockFlowDiscoveryRegistry.getAllProjects.mockReturnValue(['project1', 'project2']);

			const project1Flows = new Map([
				['flow-1', { id: 'flow-1', name: 'Flow 1', steps: [] }],
				['flow-2', { id: 'flow-2', name: 'Flow 2', steps: [] }],
			]);
			const project2Flows = new Map([['flow-3', { id: 'flow-3', name: 'Flow 3', steps: [] }]]);

			mockFlowDiscoveryRegistry.getProjectFlows
				.mockReturnValueOnce(project1Flows)
				.mockReturnValueOnce(project2Flows);

			const response = await request(app).get('/flows');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				project1: {
					'flow-1': { id: 'flow-1', name: 'Flow 1', steps: [] },
					'flow-2': { id: 'flow-2', name: 'Flow 2', steps: [] },
				},
				project2: {
					'flow-3': { id: 'flow-3', name: 'Flow 3', steps: [] },
				},
			});
		});

		it('should return 500 when listing flows fails', async () => {
			mockFlowDiscoveryRegistry.getAllProjects.mockImplementation(() => {
				throw new Error('Registry error');
			});

			const response = await request(app).get('/flows');

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: 'Registry error' });
		});
	});

	describe('GET /flows/:projectId', () => {
		it('should return 404 when project not found', async () => {
			mockFlowDiscoveryRegistry.getProjectFlows.mockReturnValue(undefined);

			const response = await request(app).get('/flows/non-existent-project');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Project not found' });
		});

		it('should return flows for a specific project', async () => {
			const projectFlows = new Map([
				['flow-1', { id: 'flow-1', name: 'Test Flow 1', steps: [] }],
				['flow-2', { id: 'flow-2', name: 'Test Flow 2', steps: [] }],
			]);
			mockFlowDiscoveryRegistry.getProjectFlows.mockReturnValue(projectFlows);

			const response = await request(app).get('/flows/test-project');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				'flow-1': { id: 'flow-1', name: 'Test Flow 1', steps: [] },
				'flow-2': { id: 'flow-2', name: 'Test Flow 2', steps: [] },
			});
			expect(mockFlowDiscoveryRegistry.getProjectFlows).toHaveBeenCalledWith('test-project');
		});

		it('should return 500 when getting project flows fails', async () => {
			mockFlowDiscoveryRegistry.getProjectFlows.mockImplementation(() => {
				throw new Error('Registry error');
			});

			const response = await request(app).get('/flows/test-project');

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
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

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
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).get('/tasks/task-1/trace');

			expect(response.status).toBe(200);
			expect(response.body.status).toBe('failed');
			expect(response.body.error).toBe('Step failed');
		});

		it('should return 404 when task not found', async () => {
			mockTaskManager.getTask = vi.fn().mockReturnValue(undefined);

			const response = await request(app).get('/tasks/non-existent/trace');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Task not found' });
		});

		it('should return 404 when task has no flowResult', async () => {
			const mockTask = createMockTask('task-1');
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

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
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).get('/tasks/task-1/trace');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'No execution trace available for this task' });
		});

		it('should return 500 when getting trace fails', async () => {
			mockTaskManager.getTask = vi.fn().mockImplementation(() => {
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
			api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager);
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
			mockWorkspaceManager.getAllWorkspaces = vi.fn().mockReturnValue(mockWorkspaces as any);

			const response = await request(app).get('/workspaces');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockWorkspaces);
			expect(mockWorkspaceManager.getAllWorkspaces).toHaveBeenCalled();
		});

		it('should return empty array when no workspaces', async () => {
			api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager);
			app = (api as any).app;

			mockWorkspaceManager.getAllWorkspaces = vi.fn().mockReturnValue([]);

			const response = await request(app).get('/workspaces');

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it('should return 500 when listing workspaces fails', async () => {
			api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager);
			app = (api as any).app;

			mockWorkspaceManager.getAllWorkspaces = vi.fn().mockImplementation(() => {
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
			api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager);
			app = (api as any).app;

			const mockWorkspace = {
				id: 'ws-1',
				path: '/tmp/workspaces/ws-1',
				taskId: 'task-1',
				status: 'active',
				createdAt: '2024-01-01T00:00:00.000Z',
				gitBranch: 'feature/test',
			};
			mockWorkspaceManager.getWorkspace = vi.fn().mockReturnValue(mockWorkspace as any);

			const response = await request(app).get('/workspaces/ws-1');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockWorkspace);
			expect(mockWorkspaceManager.getWorkspace).toHaveBeenCalledWith('ws-1');
		});

		it('should return 404 when workspace not found', async () => {
			api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager);
			app = (api as any).app;

			mockWorkspaceManager.getWorkspace = vi.fn().mockReturnValue(undefined);

			const response = await request(app).get('/workspaces/non-existent');

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: 'Workspace not found' });
		});

		it('should return 500 when getting workspace fails', async () => {
			api = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager);
			app = (api as any).app;

			mockWorkspaceManager.getWorkspace = vi.fn().mockImplementation(() => {
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
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app)
				.post('/tasks')
				.set('Content-Type', 'application/json')
				.send(JSON.stringify({ description: 'Test task' }));

			expect(response.status).toBe(201);
			expect(mockTaskManager.createTask).toHaveBeenCalled();
		});

		it('should log API requests', async () => {
			await request(app).get('/health');

			expect(logger.info).toHaveBeenCalledWith('[API] GET /health');
		});

		it('should log POST requests', async () => {
			const mockTask = createMockTask('task-1');
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			await request(app).post('/tasks').send({ description: 'Test' });

			expect(logger.info).toHaveBeenCalledWith('[API] POST /tasks');
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
				// assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
				assignedTo: { workerId: 'worker-1' },
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
			mockTaskManager.getTask = vi.fn().mockReturnValue(complexTask);

			const response = await request(app).get('/tasks/task-1');

			expect(response.status).toBe(200);
			expect(response.body).toEqual(complexTask);
		});

		it('should handle special characters in task description', async () => {
			const mockTask = createMockTask('task-1', {
				description: 'Task with "quotes", <tags>, & symbols!',
			});
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app)
				.post('/tasks')
				.send({ description: 'Task with "quotes", <tags>, & symbols!' });

			expect(response.status).toBe(201);
			expect(response.body.description).toBe('Task with "quotes", <tags>, & symbols!');
		});

		it('should handle very long task descriptions', async () => {
			const longDescription = 'A'.repeat(10000);
			const mockTask = createMockTask('task-1', { description: longDescription });
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).post('/tasks').send({ description: longDescription });

			expect(response.status).toBe(201);
			expect(response.body.description).toBe(longDescription);
		});

		it('should handle unicode characters in descriptions', async () => {
			const unicodeDesc = 'Task with 中文, العربية, Emoji 🚀';
			const mockTask = createMockTask('task-1', { description: unicodeDesc });
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).post('/tasks').send({ description: unicodeDesc });

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
			mockTaskManager.createTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).post('/tasks').send({ description: 'Test task' });

			expect(response.status).toBe(201);
		});

		it('should handle numeric task IDs', async () => {
			const mockTask = createMockTask('12345');
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).get('/tasks/12345');

			expect(response.status).toBe(200);
			expect(response.body.id).toBe('12345');
		});

		it('should handle task IDs with special characters', async () => {
			const taskId = 'task-with-dashes_and_underscores';
			const mockTask = createMockTask(taskId);
			mockTaskManager.getTask = vi.fn().mockReturnValue(mockTask);

			const response = await request(app).get(`/tasks/${taskId}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(taskId);
		});
	});

	describe('UIClientHook Integration', () => {
		it('should initialize UIWebSocketServer when UIClientHook is provided', () => {
			const mockUIClientHook = {
				enable: vi.fn(),
				disable: vi.fn(),
				isActive: vi.fn().mockReturnValue(true),
				on: vi.fn(),
				off: vi.fn(),
				emit: vi.fn(),
				removeAllListeners: vi.fn(),
			} as any;

			const apiWithUI = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager, mockUIClientHook);

			// Verify UIWebSocketServer was instantiated
			expect(UIWebSocketServer).toHaveBeenCalledWith(mockUIClientHook);
		});

		it('should not initialize UIWebSocketServer when UIClientHook is not provided', () => {
			// Clear previous mock calls
			vi.clearAllMocks();

			const apiWithoutUI = new RestAPI(mockTaskManager, mockWsServer, 3737);

			// Verify UIWebSocketServer was not instantiated
			expect(UIWebSocketServer).not.toHaveBeenCalled();
		});

		it('should start UIWebSocketServer when UIClientHook is provided', () => {
			vi.clearAllMocks();

			const mockUIClientHook = {
				enable: vi.fn(),
				disable: vi.fn(),
				isActive: vi.fn().mockReturnValue(true),
				on: vi.fn(),
				off: vi.fn(),
				emit: vi.fn(),
				removeAllListeners: vi.fn(),
			} as any;

			const apiWithUI = new RestAPI(mockTaskManager, mockWsServer, 3737, mockWorkspaceManager, mockUIClientHook);

			// Verify UIWebSocketServer constructor was called
			expect(UIWebSocketServer).toHaveBeenCalledWith(mockUIClientHook);
		});

		it('should not initialize UIWebSocketServer when UIClientHook is omitted', () => {
			vi.clearAllMocks();

			const apiWithoutUI = new RestAPI(mockTaskManager, mockWsServer, 3788);

			// Verify UIWebSocketServer was not created
			expect(UIWebSocketServer).not.toHaveBeenCalled();
		});
	});
});
