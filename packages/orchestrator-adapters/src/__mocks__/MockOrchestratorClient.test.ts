/**
 * ===========================================================================================
 * MOCK ORCHESTRATOR CLIENT - UNIT TESTS
 * ===========================================================================================
 *
 * Comprehensive tests for MockOrchestratorClient test double.
 *
 * Test Coverage:
 * - Method mocking (static and function responses)
 * - Call history tracking
 * - Event emission and subscription
 * - Helper methods (getCallsFor, wasCalled, getCallCount)
 * - Default responses
 * - Lifecycle management (connect/disconnect)
 *
 * ===========================================================================================
 */
import { describe, expect, test, vi } from 'vitest';

import type { O2BEventData } from '@app/shared-orch-backend';

import { MockOrchestratorClient } from './MockOrchestratorClient.js';

describe('MockOrchestratorClient', () => {
	// ===========================================================================================
	// LIFECYCLE
	// ===========================================================================================

	test('should track connect call', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		await mock.connect();

		// Assert
		expect(mock.callHistory).toHaveLength(1);
		expect(mock.callHistory[0].method).toBe('connect');
		expect(mock.callHistory[0].args).toEqual([]);
		expect(mock.isConnected()).toBe(true);
	});

	test('should track disconnect call and clean up', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		await mock.connect();

		// Act
		await mock.disconnect();

		// Assert
		expect(mock.callHistory).toHaveLength(2);
		expect(mock.callHistory[1].method).toBe('disconnect');
		expect(mock.isConnected()).toBe(false);
	});

	// ===========================================================================================
	// METHOD MOCKING - STATIC RESPONSES
	// ===========================================================================================

	test('should return static mock response for createTask', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const mockTask = {
			id: 'task-static-123',
			status: 'in-progress' as any,
			description: 'Static task',
			metadata: {},
			createdAt: '2025-01-01T00:00:00Z',
			updatedAt: '2025-01-01T00:00:00Z',
			priority: 'high',
			assignedTo: 'worker-1',
			comments: [],
			history: [],
		};
		mock.setMockResponse('createTask', mockTask);

		// Act
		const result = await mock.createTask('Test task');

		// Assert
		expect(result).toEqual(mockTask);
		expect(mock.wasCalled('createTask')).toBe(true);
	});

	test('should return static mock response for getTask', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const mockTask = {
			id: 'task-456',
			status: 'completed' as any,
			description: 'Completed task',
			metadata: {},
			createdAt: '2025-01-01T00:00:00Z',
			updatedAt: '2025-01-01T00:00:00Z',
			priority: 'low',
			assignedTo: null,
			comments: [],
			history: [],
		};
		mock.setMockResponse('getTask', mockTask);

		// Act
		const result = await mock.getTask('task-456');

		// Assert
		expect(result).toEqual(mockTask);
	});

	// ===========================================================================================
	// METHOD MOCKING - FUNCTION RESPONSES
	// ===========================================================================================

	test('should call function mock response with arguments', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const mockFn = vi.fn((description: string, metadata?: Record<string, unknown>) => ({
			id: `task-${description}`,
			status: 'pending' as any,
			description,
			metadata: metadata || {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			priority: 'medium',
			assignedTo: null,
			comments: [],
			history: [],
		}));
		mock.setMockResponse('createTask', mockFn);

		// Act
		const result = await mock.createTask('Dynamic task', { key: 'value' });

		// Assert
		expect(mockFn).toHaveBeenCalledWith('Dynamic task', { key: 'value' });
		expect(result.id).toBe('task-Dynamic task');
		expect(result.description).toBe('Dynamic task');
		expect(result.metadata).toEqual({ key: 'value' });
	});

	test('should support dynamic response based on input', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		mock.setMockResponse('getTask', (taskId: string) => {
			if (taskId === 'existing-task') {
				return {
					id: taskId,
					status: 'pending' as any,
					description: 'Existing',
					metadata: {},
					createdAt: '2025-01-01T00:00:00Z',
					updatedAt: '2025-01-01T00:00:00Z',
					priority: 'medium',
					assignedTo: null,
					comments: [],
					history: [],
				};
			}
			return null;
		});

		// Act
		const found = await mock.getTask('existing-task');
		const notFound = await mock.getTask('non-existent-task');

		// Assert
		expect(found).not.toBeNull();
		expect(found?.id).toBe('existing-task');
		expect(notFound).toBeNull();
	});

	// ===========================================================================================
	// DEFAULT RESPONSES
	// ===========================================================================================

	test('should return default response for createTask when not mocked', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		const result = await mock.createTask('Default task', { test: true });

		// Assert
		expect(result.id).toMatch(/^task-\d+/);
		expect(result.description).toBe('Default task');
		expect(result.status).toBe('pending');
		expect(result.metadata).toEqual({ test: true });
		expect(result.priority).toBe('medium');
	});

	test('should return null for getTask when not mocked', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		const result = await mock.getTask('any-task-id');

		// Assert
		expect(result).toBeNull();
	});

	test('should return empty array for getTasks when not mocked', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		const result = await mock.getTasks();

		// Assert
		expect(result).toEqual([]);
	});

	test('should return empty array for getWorkers when not mocked', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		const result = await mock.getWorkers();

		// Assert
		expect(result).toEqual([]);
	});

	test('should return default stats for getStats when not mocked', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		const result = await mock.getStats();

		// Assert
		expect(result).toEqual({
			restPort: 3738,
			wsPort: 3738,
			uptime: 0,
			workers: 0,
			workersList: [],
			tasks: {
				total: 0,
				byStatus: {},
			},
		});
	});

	// ===========================================================================================
	// CALL HISTORY TRACKING
	// ===========================================================================================

	test('should track all method calls in history', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		await mock.connect();
		await mock.createTask('Task 1');
		await mock.getTask('task-1');
		await mock.getTasks();
		await mock.getStats();

		// Assert
		expect(mock.callHistory).toHaveLength(5);
		expect(mock.callHistory[0].method).toBe('connect');
		expect(mock.callHistory[1].method).toBe('createTask');
		expect(mock.callHistory[2].method).toBe('getTask');
		expect(mock.callHistory[3].method).toBe('getTasks');
		expect(mock.callHistory[4].method).toBe('getStats');
	});

	test('should track method arguments in history', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		await mock.createTask('Task description', { priority: 'high' });
		await mock.getTask('task-123');
		await mock.getTasks({ status: 'pending' as any });

		// Assert
		expect(mock.callHistory[0].args).toEqual(['Task description', { priority: 'high' }]);
		expect(mock.callHistory[1].args).toEqual(['task-123']);
		expect(mock.callHistory[2].args).toEqual([{ status: 'pending' }]);
	});

	test('should track timestamps for calls', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const beforeTime = Date.now();

		// Act
		await mock.createTask('Task');

		// Assert
		const afterTime = Date.now();
		expect(mock.callHistory[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
		expect(mock.callHistory[0].timestamp).toBeLessThanOrEqual(afterTime);
	});

	// ===========================================================================================
	// HELPER METHODS
	// ===========================================================================================

	test('getCallsFor should filter calls by method name', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		await mock.createTask('Task 1');
		await mock.getTask('task-1');
		await mock.createTask('Task 2');

		// Act
		const createTaskCalls = mock.getCallsFor('createTask');
		const getTaskCalls = mock.getCallsFor('getTask');

		// Assert
		expect(createTaskCalls).toHaveLength(2);
		expect(createTaskCalls[0].args[0]).toBe('Task 1');
		expect(createTaskCalls[1].args[0]).toBe('Task 2');
		expect(getTaskCalls).toHaveLength(1);
		expect(getTaskCalls[0].args[0]).toBe('task-1');
	});

	test('wasCalled should return true if method was called', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		await mock.createTask('Task');

		// Act & Assert
		expect(mock.wasCalled('createTask')).toBe(true);
		expect(mock.wasCalled('getTask')).toBe(false);
	});

	test('getCallCount should return number of times method was called', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		await mock.createTask('Task 1');
		await mock.createTask('Task 2');
		await mock.createTask('Task 3');
		await mock.getTask('task-1');

		// Act & Assert
		expect(mock.getCallCount('createTask')).toBe(3);
		expect(mock.getCallCount('getTask')).toBe(1);
		expect(mock.getCallCount('getTasks')).toBe(0);
	});

	test('clearCallHistory should remove all call records', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		await mock.createTask('Task');
		await mock.getTask('task-1');

		// Act
		mock.clearCallHistory();

		// Assert
		expect(mock.callHistory).toHaveLength(0);
		expect(mock.wasCalled('createTask')).toBe(false);
	});

	// ===========================================================================================
	// EVENT EMISSION AND SUBSCRIPTION
	// ===========================================================================================

	test('should emit and receive task.created event', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const handler = vi.fn();
		mock.on('task.created', handler);

		const eventData: O2BEventData<'task.created'> = {
			taskId: 'task-123',
			task: {} as any,
			timestamp: new Date().toISOString(),
		};

		// Act
		mock.emitEvent('task.created', eventData);

		// Assert
		expect(handler).toHaveBeenCalledWith(eventData);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	test('should emit and receive multiple event types', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const taskHandler = vi.fn();
		const workerHandler = vi.fn();

		mock.on('task.completed', taskHandler);
		mock.on('worker.status', workerHandler);

		const taskEvent: O2BEventData<'task.completed'> = {
			taskId: 'task-123',
			timestamp: new Date().toISOString(),
		};

		const workerEvent: O2BEventData<'worker.status'> = {
			workerId: 'worker-1',
			status: 'idle',
			timestamp: new Date().toISOString(),
		};

		// Act
		mock.emitEvent('task.completed', taskEvent);
		mock.emitEvent('worker.status', workerEvent);

		// Assert
		expect(taskHandler).toHaveBeenCalledWith(taskEvent);
		expect(workerHandler).toHaveBeenCalledWith(workerEvent);
	});

	test('should track on() subscription calls', () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const handler = vi.fn();

		// Act
		mock.on('task.created', handler);

		// Assert
		expect(mock.wasCalled('on')).toBe(true);
		expect(mock.getCallsFor('on')[0].args[0]).toBe('task.created');
	});

	test('should track off() unsubscription calls', () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const handler = vi.fn();
		mock.on('task.created', handler);

		// Act
		mock.off('task.created', handler);

		// Assert
		expect(mock.wasCalled('off')).toBe(true);
		expect(mock.getCallsFor('off')[0].args[0]).toBe('task.created');
	});

	test('should not deliver events after unsubscribe', () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const handler = vi.fn();

		mock.on('task.created', handler);
		mock.off('task.created', handler);

		const eventData: O2BEventData<'task.created'> = {
			taskId: 'task-123',
			task: {} as any,
			timestamp: new Date().toISOString(),
		};

		// Act
		mock.emitEvent('task.created', eventData);

		// Assert
		expect(handler).not.toHaveBeenCalled();
	});

	test('disconnect should remove all event listeners', () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const handler = vi.fn();

		mock.on('task.created', handler);

		// Act
		mock.disconnect();

		const eventData: O2BEventData<'task.created'> = {
			taskId: 'task-123',
			task: {} as any,
			timestamp: new Date().toISOString(),
		};
		mock.emitEvent('task.created', eventData);

		// Assert
		expect(handler).not.toHaveBeenCalled();
	});

	// ===========================================================================================
	// MOCK CONFIGURATION
	// ===========================================================================================

	test('clearMockResponse should remove specific mock', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const mockTask = { id: 'task-123' } as any;
		mock.setMockResponse('createTask', mockTask);

		// Act
		mock.clearMockResponse('createTask');
		const result = await mock.createTask('Task');

		// Assert - should return default response
		expect(result).not.toEqual(mockTask);
		expect(result.id).toMatch(/^task-\d+/);
	});

	test('clearAllMockResponses should remove all mocks', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		mock.setMockResponse('createTask', { id: 'mocked-task' } as any);
		mock.setMockResponse('getTasks', [{ id: 'task-1' }] as any);

		// Act
		mock.clearAllMockResponses();
		const task = await mock.createTask('Task');
		const tasks = await mock.getTasks();

		// Assert - should return default responses
		expect(task.id).toMatch(/^task-\d+/);
		expect(tasks).toEqual([]);
	});

	// ===========================================================================================
	// VOID METHODS
	// ===========================================================================================

	test('updateConfig should track call without mock', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();
		const config = { maxTaskRetries: 5 };

		// Act
		await mock.updateConfig(config);

		// Assert
		expect(mock.wasCalled('updateConfig')).toBe(true);
		expect(mock.getCallsFor('updateConfig')[0].args[0]).toEqual(config);
	});

	test('renameWorker should track call without mock', async () => {
		// Arrange
		const mock = new MockOrchestratorClient();

		// Act
		await mock.renameWorker('worker-1', 'New Worker Name');

		// Assert
		expect(mock.wasCalled('renameWorker')).toBe(true);
		expect(mock.getCallsFor('renameWorker')[0].args).toEqual(['worker-1', 'New Worker Name']);
	});
});
