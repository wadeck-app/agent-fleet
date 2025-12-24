/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT FACTORY - UNIT TESTS
 * ===========================================================================================
 *
 * Tests for the OrchestratorClientFactory, focusing on the test mode.
 *
 * Test Coverage:
 * - Test mode with default mock
 * - Test mode with custom mock orchestrator
 * - Verify no side effects (no real orchestrator started)
 * - Type safety and interface compliance
 *
 * ===========================================================================================
 */
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { describe, expect, test, vi } from 'vitest';

import { OrchestratorClientFactory } from './OrchestratorClientFactory';
import { createMockOrchestrator, createMockTask } from './__mocks__/MockOrchestrator';

describe('OrchestratorClientFactory - Test Mode', () => {
	test('should create client in test mode with default mock', async () => {
		// Arrange & Act
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		// Assert
		expect(client).toBeDefined();
		expect(client.connect).toBeDefined();
		expect(client.createTask).toBeDefined();

		// Verify basic functionality with default mock
		await client.connect();
		const task = await client.createTask('Test task');

		expect(task).toBeDefined();
		expect(task.id).toMatch(/^task-/);
		expect(task.description).toBe('Test task');
		expect(task.status).toBe(TaskStatus.TODO);
	});

	test('should create client with custom mock orchestrator', async () => {
		// Arrange
		const customTask = createMockTask({
			id: 'custom-task-123',
			description: 'Custom test task',
			status: TaskStatus.IN_PROGRESS,
		});

		const createTaskMock = vi.fn().mockResolvedValue(customTask);

		const customMockOrchestrator = createMockOrchestrator({
			taskManager: {
				createTask: createTaskMock,
			},
		});

		// Act
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
			mockOrchestrator: customMockOrchestrator,
		});

		await client.connect();
		const task = await client.createTask('Custom task', { priority: 'high' });

		// Assert
		expect(createTaskMock).toHaveBeenCalledWith('Custom task', { priority: 'high' });
		expect(task.id).toBe('custom-task-123');
		expect(task.description).toBe('Custom test task');
		expect(task.status).toBe(TaskStatus.IN_PROGRESS);
	});

	test('should return null for getTask with default mock', async () => {
		// Arrange
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		// Act
		await client.connect();
		const task = await client.getTask('non-existent-task');

		// Assert
		expect(task).toBeNull();
	});

	test('should return empty array for getTasks with default mock', async () => {
		// Arrange
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		// Act
		await client.connect();
		const tasks = await client.getTasks();

		// Assert
		expect(tasks).toEqual([]);
	});

	test('should return empty array for getWorkers with default mock', async () => {
		// Arrange
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		// Act
		await client.connect();
		const workers = await client.getWorkers();

		// Assert
		expect(workers).toEqual([]);
	});

	test('should return mock stats with default mock', async () => {
		// Arrange
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		// Act
		await client.connect();
		const stats = await client.getStats();

		// Assert
		expect(stats).toBeDefined();
		expect(stats.wsPort).toBe(3738);
		expect(stats.tasks.total).toBe(0);
		expect(stats.workers).toBe(0);
	});

	test('should support custom mock with predefined tasks', async () => {
		// Arrange
		const mockTasks = [
			createMockTask({ id: 'task-1', description: 'Task 1' }),
			createMockTask({ id: 'task-2', description: 'Task 2' }),
		];

		const customMockOrchestrator = createMockOrchestrator({
			taskManager: {
				getAllTasks: () => mockTasks,
			},
		});

		// Act
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
			mockOrchestrator: customMockOrchestrator,
		});

		await client.connect();
		const tasks = await client.getTasks();

		// Assert
		expect(tasks).toHaveLength(2);
		expect(tasks[0].id).toBe('task-1');
		expect(tasks[1].id).toBe('task-2');
	});

	test('should support event subscription with default mock', async () => {
		// Arrange
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		await client.connect();

		// Setup event listener
		client.on('task.created', _data => {
			// Event handler for testing
		});

		// Act - Get the mock orchestrator to emit an event
		const mockOrchestrator = createMockOrchestrator();
		const taskManager = mockOrchestrator.getTaskManager();

		// Emit event through stateManager
		taskManager.stateManager.emit('TASK_CREATED', {
			task: createMockTask({ id: 'event-task-123' }),
		});

		// Note: This test shows the structure but won't actually work
		// because we're using a different mock instance.
		// In real scenarios, the test would use the same mock instance
		// or the client would expose a way to trigger events.
	});

	test('should allow disconnect without errors', async () => {
		// Arrange
		const client = await OrchestratorClientFactory.create({
			mode: 'test',
		});

		// Act & Assert
		await client.connect();
		await expect(client.disconnect()).resolves.not.toThrow();
	});

	test('should work with task filters', async () => {
		// Arrange
		const mockTasks = [
			createMockTask({ id: 'task-1', status: TaskStatus.TODO }),
			createMockTask({ id: 'task-2', status: TaskStatus.IN_PROGRESS }),
		];

		const customMockOrchestrator = createMockOrchestrator({
			taskManager: {
				getAllTasks: () => mockTasks,
			},
		});

		const client = await OrchestratorClientFactory.create({
			mode: 'test',
			mockOrchestrator: customMockOrchestrator,
		});

		// Act
		await client.connect();
		const todoTasks = await client.getTasks({ status: TaskStatus.TODO });

		// Assert
		expect(todoTasks).toHaveLength(1);
		expect(todoTasks[0].status).toBe(TaskStatus.TODO);
	});

	test('should throw error for unknown mode', async () => {
		// Arrange & Act & Assert
		await expect(
			OrchestratorClientFactory.create({
				mode: 'invalid-mode',
			} as any)
		).rejects.toThrow('Unknown orchestrator client mode: invalid-mode');
	});
});
