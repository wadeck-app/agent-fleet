import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TasksData, TasksQuery } from '@app/shared/api/tasks.contract';

import type { TasksService } from '../services/TasksService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import TasksController from './TasksController';

describe('TasksController', () => {
	let mockService: TasksService;
	let controller: TasksController;

	beforeEach(() => {
		// Create mock service
		mockService = {
			getTasksData: vi.fn(),
		} as unknown as TasksService;

		controller = new TasksController(mockService);
	});

	const createMockTasksData = (): TasksData => ({
		timestamp: new Date().toISOString(),
		summary: {
			total: 5,
			byStatus: {
				in_progress: 2,
				review: 1,
				todo: 2,
			},
			byPriority: {
				high: 2,
				medium: 2,
				low: 1,
			},
		},
		tasks: [
			{
				id: 'task-1',
				description: 'Implement feature X',
				status: 'in_progress',
				priority: 'high',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				assignedWorker: {
					workerId: 'worker-1',
				},
			},
		],
	});

	describe('configureRoutes', () => {
		it('should register GET /api/tasks/ route', () => {
			// Arrange
			const mockAdd = vi.fn();

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			// Assert
			expect(mockAdd).toHaveBeenCalledWith('GET', '/api/tasks/', expect.any(Function));
		});

		it('should call service.getTasksData() without query when route handler is invoked', async () => {
			// Arrange
			const mockData = createMockTasksData();
			vi.mocked(mockService.getTasksData).mockResolvedValue(mockData);

			let routeHandler: (request: any) => Promise<TasksData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/tasks/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			// Invoke the route handler with empty query
			const mockRequest = { query: {} };
			const result = await routeHandler!(mockRequest);

			// Assert
			expect(mockService.getTasksData).toHaveBeenCalledTimes(1);
			expect(mockService.getTasksData).toHaveBeenCalledWith({});
			expect(result).toEqual(mockData);
		});

		it('should pass query parameters to service', async () => {
			// Arrange
			const mockData = createMockTasksData();
			vi.mocked(mockService.getTasksData).mockResolvedValue(mockData);

			let routeHandler: (request: any) => Promise<TasksData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/tasks/') {
					routeHandler = handler;
				}
			});

			const query: TasksQuery = {
				status: 'in_progress',
				workerId: 'worker-1',
				priority: 'high',
			};

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			// Invoke the route handler with query
			const mockRequest = { query };
			const result = await routeHandler!(mockRequest);

			// Assert
			expect(mockService.getTasksData).toHaveBeenCalledTimes(1);
			expect(mockService.getTasksData).toHaveBeenCalledWith(query);
			expect(result).toEqual(mockData);
		});

		it('should pass status filter to service', async () => {
			// Arrange
			const mockData = createMockTasksData();
			vi.mocked(mockService.getTasksData).mockResolvedValue(mockData);

			let routeHandler: (request: any) => Promise<TasksData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/tasks/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			const mockRequest = { query: { status: 'review' } };
			await routeHandler!(mockRequest);

			// Assert
			expect(mockService.getTasksData).toHaveBeenCalledWith({ status: 'review' });
		});

		it('should pass workerId filter to service', async () => {
			// Arrange
			const mockData = createMockTasksData();
			vi.mocked(mockService.getTasksData).mockResolvedValue(mockData);

			let routeHandler: (request: any) => Promise<TasksData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/tasks/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			const mockRequest = { query: { workerId: 'worker-123' } };
			await routeHandler!(mockRequest);

			// Assert
			expect(mockService.getTasksData).toHaveBeenCalledWith({ workerId: 'worker-123' });
		});

		it('should return data matching TasksData schema', async () => {
			// Arrange
			const mockData = createMockTasksData();
			vi.mocked(mockService.getTasksData).mockResolvedValue(mockData);

			let routeHandler: (request: any) => Promise<TasksData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/tasks/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);
			const mockRequest = { query: {} };
			const result = await routeHandler!(mockRequest);

			// Assert
			expect(result).toHaveProperty('timestamp');
			expect(result).toHaveProperty('summary');
			expect(result.summary).toHaveProperty('total');
			expect(result.summary).toHaveProperty('byStatus');
			expect(result.summary).toHaveProperty('byPriority');
			expect(result).toHaveProperty('tasks');
			expect(Array.isArray(result.tasks)).toBe(true);
		});

		it('should return empty tasks when service returns empty data', async () => {
			// Arrange
			const emptyData: TasksData = {
				timestamp: new Date().toISOString(),
				summary: {
					total: 0,
					byStatus: {},
					byPriority: {},
				},
				tasks: [],
			};
			vi.mocked(mockService.getTasksData).mockResolvedValue(emptyData);

			let routeHandler: (request: any) => Promise<TasksData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/tasks/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);
			const mockRequest = { query: {} };
			const result = await routeHandler!(mockRequest);

			// Assert
			expect(result.tasks).toHaveLength(0);
			expect(result.summary.total).toBe(0);
		});
	});

	describe('static routes property', () => {
		it('should expose routes definition', () => {
			// Assert
			expect(TasksController.routes).toBeDefined();
			expect(TasksController.routes['/api/tasks/']).toBeDefined();
			expect(TasksController.routes['/api/tasks/'].GET).toBeDefined();
		});
	});
});
