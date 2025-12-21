import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DashboardData } from '@app/shared';
import { InternalServerErrorException } from '@app/shared';
import DashboardController from './DashboardController';
import type { DashboardService } from '../services/DashboardService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';

describe('DashboardController', () => {
	let mockService: DashboardService;
	let controller: DashboardController;

	beforeEach(() => {
		// Create mock service
		mockService = {
			getDashboardData: vi.fn(),
		} as unknown as DashboardService;

		controller = new DashboardController(mockService);
	});

	const createMockDashboardData = (): DashboardData => ({
		timestamp: new Date().toISOString(),
		orchestrator: {
			status: 'ready',
			uptime: 0,
			version: '1.0.0',
		},
		workers: {
			connected: 3,
			idle: 1,
			busy: 2,
		},
		tasks: {
			total: 10,
			active: 3,
			review: 2,
			done: 4,
			blocked: 1,
			failed: 0,
		},
		throughput: {
			tasksPerHour: 5.5,
			successRate: 95,
			avgTaskDuration: 180000,
		},
		recentActivity: [],
	});

	describe('configureRoutes', () => {
		it('should register GET /api/dashboard/ route', () => {
			// Arrange
			const mockAdd = vi.fn();

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			// Assert
			expect(mockAdd).toHaveBeenCalledWith('GET', '/api/dashboard/', expect.any(Function));
		});

		it('should call service.getDashboardData() when route handler is invoked', async () => {
			// Arrange
			const mockData = createMockDashboardData();
			vi.mocked(mockService.getDashboardData).mockResolvedValue(mockData);

			let routeHandler: () => Promise<DashboardData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/dashboard/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			// Invoke the route handler
			const result = await routeHandler!();

			// Assert
			expect(mockService.getDashboardData).toHaveBeenCalledTimes(1);
			expect(result).toEqual(mockData);
		});

		it('should propagate service errors to route handler', async () => {
			// Arrange
			const mockError = new InternalServerErrorException('Service error');
			vi.mocked(mockService.getDashboardData).mockRejectedValue(mockError);

			let routeHandler: () => Promise<DashboardData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/dashboard/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);

			// Assert
			await expect(routeHandler!()).rejects.toThrow(InternalServerErrorException);
			await expect(routeHandler!()).rejects.toThrow('Service error');
		});

		it('should return data matching DashboardData schema', async () => {
			// Arrange
			const mockData = createMockDashboardData();
			vi.mocked(mockService.getDashboardData).mockResolvedValue(mockData);

			let routeHandler: () => Promise<DashboardData>;
			const mockAdd = vi.fn((method, path, handler) => {
				if (method === 'GET' && path === '/api/dashboard/') {
					routeHandler = handler;
				}
			});

			// Act
			controller.configureRoutes(mockAdd as unknown as RouteWrapperFunc<any>);
			const result = await routeHandler!();

			// Assert
			expect(result).toHaveProperty('timestamp');
			expect(result).toHaveProperty('orchestrator');
			expect(result.orchestrator).toHaveProperty('status');
			expect(result.orchestrator).toHaveProperty('uptime');
			expect(result.orchestrator).toHaveProperty('version');
			expect(result).toHaveProperty('workers');
			expect(result.workers).toHaveProperty('connected');
			expect(result.workers).toHaveProperty('idle');
			expect(result.workers).toHaveProperty('busy');
			expect(result).toHaveProperty('tasks');
			expect(result.tasks).toHaveProperty('total');
			expect(result.tasks).toHaveProperty('active');
			expect(result.tasks).toHaveProperty('review');
			expect(result.tasks).toHaveProperty('done');
			expect(result.tasks).toHaveProperty('blocked');
			expect(result.tasks).toHaveProperty('failed');
		});
	});

	describe('static routes property', () => {
		it('should expose routes definition', () => {
			// Assert
			expect(DashboardController.routes).toBeDefined();
			expect(DashboardController.routes['/api/dashboard/']).toBeDefined();
			expect(DashboardController.routes['/api/dashboard/'].GET).toBeDefined();
		});
	});
});
