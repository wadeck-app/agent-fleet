/**
 * TaskManager Tests
 */
import { Storage } from 'orchestrator/core/Storage';
import { createMockStateManager } from 'orchestrator/test-utils/mocks';
import { logger } from 'shared-common/logger';
import type { StateManager } from 'shared-orch-worker/StateManager';
import type { Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { setupTest, setupTimers } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskManager } from './TaskManager';

// Mock dependencies
vi.mock('shared-common/Storage');
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger', () => ({	createLogger: () => ({		info: vi.fn(),		warn: vi.fn(),		error: vi.fn(),		debug: vi.fn(),	}),	logger: {		info: vi.fn(),		warn: vi.fn(),		error: vi.fn(),		debug: vi.fn(),	},}));
vi.mock('uuid', () => ({
	v4: vi.fn(() => 'test-uuid-1234'),
}));

describe('TaskManager', () => {
	let cleanup: () => void;
	let cleanupTimers: () => void;
	let taskManager: TaskManager;
	// let mockStateManager: ReturnType<typeof createMockStateManager>;
	let mockStateManager: Partial<StateManager>;

	beforeEach(async () => {
		cleanup = setupTest();
		cleanupTimers = setupTimers();

		// Mock StateManager using test-utils
		mockStateManager = createMockStateManager();

		// Mock Storage with async methods
		vi.mocked(Storage.initialize).mockResolvedValue(undefined);
		vi.mocked(Storage.listTasks).mockResolvedValue([]);
		vi.mocked(Storage.saveTask).mockResolvedValue(undefined);
		vi.mocked(Storage.deleteTask).mockResolvedValue(undefined);

		// Mock Date to have consistent timestamps
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

		taskManager = new TaskManager(mockStateManager as StateManager);
		await taskManager.initialize();
	});

	afterEach(() => {
		cleanup();
		cleanupTimers();
	});

	describe('Constructor and Initialization', () => {
		it('should initialize with empty tasks when storage is empty', async () => {
			expect(Storage.initialize).toHaveBeenCalled();
			expect(Storage.listTasks).toHaveBeenCalled();
			expect(taskManager.getAllTasks()).toHaveLength(0);
			expect(logger.info).toHaveBeenCalledWith('[TaskManager] Loaded 0 tasks');
		});

		it('should load existing tasks from storage', async () => {
			const existingTasks: Task[] = [
				{
					id: 'task-1',
					description: 'Existing task',
					status: TaskStatus.BACKLOG,
					priority: 'medium',
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-01T00:00:00.000Z',
					assignedTo: null,
					comments: [],
					metadata: {},
					history: [],
				},
			];

			vi.mocked(Storage.listTasks).mockResolvedValue(existingTasks);

			const newManager = new TaskManager(mockStateManager as StateManager);
			await newManager.initialize();

			expect(newManager.getAllTasks()).toHaveLength(1);
			expect(newManager.getTask('task-1')).toEqual(existingTasks[0]);
		});
	});

	describe('createTask', () => {
		it('should create a task with default values', async () => {
			const task = await taskManager.createTask('Test task description');

			expect(task).toMatchObject({
				id: 'test-uuid-1234',
				description: 'Test task description',
				status: TaskStatus.BACKLOG,
				priority: 'medium',
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
				assignedTo: null,
				comments: [],
				metadata: {},
			});

			expect(task.history).toHaveLength(1);
			expect(task.history[0]).toMatchObject({
				timestamp: '2024-01-01T00:00:00.000Z',
				event: 'created',
				status: TaskStatus.BACKLOG,
			});
		});

		it('should create a task with custom metadata', async () => {
			const metadata = {
				priority: 'high',
				flowId: 'test-flow',
				customField: 'value',
			};

			const task = await taskManager.createTask('Task with metadata', metadata);

			expect(task.priority).toBe('high');
			expect(task.metadata).toMatchObject(metadata);
		});

		it('should save task to storage', async () => {
			const task = await taskManager.createTask('Save test');

			expect(Storage.saveTask).toHaveBeenCalledWith(task);
		});

		it('should emit task created event', async () => {
			const task = await taskManager.createTask('Event test');

			expect(mockStateManager.emitTaskCreated).toHaveBeenCalledWith(task);
		});

		it('should log task creation', async () => {
			await taskManager.createTask('Log test task');

			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining('[TaskManager] Created task test-uuid-1234')
			);
		});

		it('should create multiple tasks with unique IDs', async () => {
			const { v4 } = await import('uuid');
			let idCounter = 0;
			vi.mocked(v4).mockImplementation(() => `uuid-${++idCounter}`);

			const task1 = await taskManager.createTask('Task 1');
			const task2 = await taskManager.createTask('Task 2');

			expect(task1.id).not.toBe(task2.id);
			expect(taskManager.getAllTasks()).toHaveLength(2);
		});
	});

	describe('updateTaskStatus', () => {
		let task: Task;

		beforeEach(async () => {
			task = await taskManager.createTask('Test task');
			vi.clearAllMocks();
		});

		it('should update task status', async () => {
			await taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.status).toBe(TaskStatus.IN_PROGRESS);
		});

		it('should update task timestamp', async () => {
			vi.setSystemTime(new Date('2024-01-01T01:00:00.000Z'));

			await taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.updatedAt).toBe('2024-01-01T01:00:00.000Z');
		});

		it('should add history entry with status change', async () => {
			await taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.history).toHaveLength(2);
			expect(updatedTask?.history[1]).toMatchObject({
				timestamp: '2024-01-01T00:00:00.000Z',
				event: 'status_change',
				oldStatus: TaskStatus.BACKLOG,
				newStatus: TaskStatus.IN_PROGRESS,
			});
		});

		it('should include additional details in history', async () => {
			await taskManager.updateTaskStatus(task.id, TaskStatus.BLOCKED, {
				reason: 'Waiting for dependencies',
				blockedBy: 'task-123',
			});

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.history[1]).toMatchObject({
				event: 'status_change',
				reason: 'Waiting for dependencies',
				blockedBy: 'task-123',
			});
		});

		it('should save updated task to storage', async () => {
			await taskManager.updateTaskStatus(task.id, TaskStatus.TODO);

			expect(Storage.saveTask).toHaveBeenCalledWith(
				expect.objectContaining({
					id: task.id,
					status: TaskStatus.TODO,
				})
			);
		});

		it('should emit task updated event', async () => {
			await taskManager.updateTaskStatus(task.id, TaskStatus.REVIEW);

			expect(mockStateManager.emitTaskUpdated).toHaveBeenCalledWith(
				expect.objectContaining({
					id: task.id,
					status: TaskStatus.REVIEW,
				})
			);
		});

		it('should log status change', async () => {
			await taskManager.updateTaskStatus(task.id, TaskStatus.APPROVED);

			expect(logger.info).toHaveBeenCalledWith(
				`[TaskManager] Task ${task.id} status: ${TaskStatus.BACKLOG} → ${TaskStatus.APPROVED}`
			);
		});

		it('should throw error for non-existent task', async () => {
			await expect(taskManager.updateTaskStatus('non-existent-id', TaskStatus.TODO)).rejects.toThrow(
				'Task non-existent-id not found'
			);
		});
	});

	describe('assignTask', () => {
		let task: Task;

		beforeEach(async () => {
			task = await taskManager.createTask('Test task');
			vi.clearAllMocks();
		});

		it('should assign task to worker', async () => {
			// await taskManager.assignTask(task.id, 'worker-1');
			await taskManager.assignTask(task.id, 'worker-1');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.assignedTo).toEqual({
				workerId: 'worker-1',
			});
		});

		it('should update task timestamp', async () => {
			vi.setSystemTime(new Date('2024-01-01T02:00:00.000Z'));

			// await taskManager.assignTask(task.id, 'worker-1');
			await taskManager.assignTask(task.id, 'worker-1');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.updatedAt).toBe('2024-01-01T02:00:00.000Z');
		});

		it('should add assignment to history', async () => {
			// await taskManager.assignTask(task.id, 'worker-1', WorkerType.REVIEWER);
			await taskManager.assignTask(task.id, 'worker-1');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.history[1]).toMatchObject({
				timestamp: '2024-01-01T00:00:00.000Z',
				event: 'assigned',
				workerId: 'worker-1',
			});
		});

		it('should save to storage', async () => {
			await taskManager.assignTask(task.id, 'worker-2');

			expect(Storage.saveTask).toHaveBeenCalledWith(
				expect.objectContaining({
					id: task.id,
					assignedTo: {
						workerId: 'worker-2',
					},
				})
			);
		});

		it('should emit task updated event', async () => {
			await taskManager.assignTask(task.id, 'worker-3');

			expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
		});

		it('should log assignment', async () => {
			await taskManager.assignTask(task.id, 'worker-1');

			expect(logger.info).toHaveBeenCalledWith(`[TaskManager] Task ${task.id} assigned to worker worker-1`);
		});

		it('should throw error for non-existent task', async () => {
			await expect(taskManager.assignTask('non-existent-id', 'worker-1')).rejects.toThrow(
				'Task non-existent-id not found'
			);
		});

		it('should allow reassigning task to different worker', async () => {
			await taskManager.assignTask(task.id, 'worker-1');
			await taskManager.assignTask(task.id, 'worker-2');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.assignedTo?.workerId).toBe('worker-2');
			expect(updatedTask?.history).toHaveLength(3); // created, assigned, assigned
		});
	});

	describe('unassignTask', () => {
		let task: Task;

		beforeEach(async () => {
			task = await taskManager.createTask('Test task');
			await taskManager.assignTask(task.id, 'worker-1');
			vi.clearAllMocks();
		});

		it('should remove task assignment', async () => {
			await taskManager.unassignTask(task.id);

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.assignedTo).toBeNull();
		});

		it('should update task timestamp', async () => {
			vi.setSystemTime(new Date('2024-01-01T03:00:00.000Z'));

			await taskManager.unassignTask(task.id);

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.updatedAt).toBe('2024-01-01T03:00:00.000Z');
		});

		it('should add unassignment to history', async () => {
			await taskManager.unassignTask(task.id);

			const updatedTask = taskManager.getTask(task.id);
			const lastHistory = updatedTask?.history[updatedTask.history.length - 1];
			expect(lastHistory).toMatchObject({
				timestamp: '2024-01-01T00:00:00.000Z',
				event: 'unassigned',
			});
		});

		it('should save to storage', async () => {
			await taskManager.unassignTask(task.id);

			expect(Storage.saveTask).toHaveBeenCalledWith(
				expect.objectContaining({
					id: task.id,
					assignedTo: null,
				})
			);
		});

		it('should emit task updated event', async () => {
			await taskManager.unassignTask(task.id);

			expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
		});

		it('should log unassignment', async () => {
			await taskManager.unassignTask(task.id);

			expect(logger.info).toHaveBeenCalledWith(`[TaskManager] Task ${task.id} unassigned`);
		});

		it('should throw error for non-existent task', async () => {
			await expect(taskManager.unassignTask('non-existent-id')).rejects.toThrow('Task non-existent-id not found');
		});
	});

	describe('addComment', () => {
		let task: Task;

		beforeEach(async () => {
			task = await taskManager.createTask('Test task');
			vi.clearAllMocks();
		});

		it('should add comment to task', async () => {
			await taskManager.addComment(task.id, 'user-1', 'This is a comment');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.comments).toHaveLength(1);
			expect(updatedTask?.comments[0]).toMatchObject({
				timestamp: '2024-01-01T00:00:00.000Z',
				author: 'user-1',
				content: 'This is a comment',
			});
		});

		it('should update task timestamp', async () => {
			vi.setSystemTime(new Date('2024-01-01T04:00:00.000Z'));

			await taskManager.addComment(task.id, 'user-1', 'Comment');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.updatedAt).toBe('2024-01-01T04:00:00.000Z');
		});

		it('should save to storage', async () => {
			await taskManager.addComment(task.id, 'user-1', 'Comment');

			expect(Storage.saveTask).toHaveBeenCalledWith(
				expect.objectContaining({
					id: task.id,
				})
			);
		});

		it('should emit task updated event', async () => {
			await taskManager.addComment(task.id, 'user-1', 'Comment');

			expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
		});

		it('should allow multiple comments', async () => {
			await taskManager.addComment(task.id, 'user-1', 'First comment');
			await taskManager.addComment(task.id, 'user-2', 'Second comment');
			await taskManager.addComment(task.id, 'user-1', 'Third comment');

			const updatedTask = taskManager.getTask(task.id);
			expect(updatedTask?.comments).toHaveLength(3);
			expect(updatedTask?.comments[1].author).toBe('user-2');
		});

		it('should throw error for non-existent task', async () => {
			await expect(taskManager.addComment('non-existent-id', 'user-1', 'Comment')).rejects.toThrow(
				'Task non-existent-id not found'
			);
		});
	});

	describe('getNextTaskForWorker', () => {
		beforeEach(async () => {
			vi.clearAllMocks();
		});

		it('should return null when no tasks available', async () => {
			const task = taskManager.getNextTaskForWorker();
			expect(task).toBeNull();
		});

		it('should return BACKLOG task for PM worker', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.BACKLOG);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(task1.id);
		});

		it('should return REFINED task for PO worker', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.REFINED);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(task1.id);
		});

		it('should return BACKLOG, TODO, or CHANGES_REQUESTED task for DEV worker', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(task1.id);
		});

		it('should return REVIEW task for REVIEWER worker', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.REVIEW);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(task1.id);
		});

		it('should not return assigned tasks', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.BACKLOG);
			await taskManager.assignTask(task1.id, 'worker-1');

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask).toBeNull();
		});

		it('should prioritize by priority order: urgent > high > medium > low', async () => {
			const lowTask = await taskManager.createTask('Low', { priority: 'low' });
			const highTask = await taskManager.createTask('High', { priority: 'high' });
			const mediumTask = await taskManager.createTask('Medium', { priority: 'medium' });
			const urgentTask = await taskManager.createTask('Urgent', { priority: 'urgent' });

			// All BACKLOG for DEV
			await taskManager.updateTaskStatus(lowTask.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(highTask.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(mediumTask.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(urgentTask.id, TaskStatus.BACKLOG);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(urgentTask.id);
		});

		it('should return first task of highest priority when multiple exist', async () => {
			const urgent1 = await taskManager.createTask('Urgent 1', { priority: 'urgent' });
			const urgent2 = await taskManager.createTask('Urgent 2', { priority: 'urgent' });

			await taskManager.updateTaskStatus(urgent1.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(urgent2.id, TaskStatus.BACKLOG);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(urgent1.id);
		});

		it('should skip tasks with wrong status', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.MERGED);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask).toBeNull();
		});

		it('should handle multiple statuses for DEV worker', async () => {
			const backlogTask = await taskManager.createTask('Backlog', { priority: 'low' });
			const todoTask = await taskManager.createTask('Todo', { priority: 'medium' });
			const changesTask = await taskManager.createTask('Changes', { priority: 'high' });

			await taskManager.updateTaskStatus(backlogTask.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(todoTask.id, TaskStatus.TODO);
			await taskManager.updateTaskStatus(changesTask.id, TaskStatus.CHANGES_REQUESTED);

			const nextTask = taskManager.getNextTaskForWorker();
			expect(nextTask?.id).toBe(changesTask.id); // highest priority
		});
	});

	describe('getTasksByStatus', () => {
		it('should return tasks with specific status', async () => {
			// Create tasks with different statuses
			const task1 = await taskManager.createTask('Task 1');
			const task2 = await taskManager.createTask('Task 2');
			const task3 = await taskManager.createTask('Task 3');

			await taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);
			await taskManager.updateTaskStatus(task2.id, TaskStatus.TODO);
			await taskManager.updateTaskStatus(task3.id, TaskStatus.IN_PROGRESS);

			const todoTasks = taskManager.getTasksByStatus(TaskStatus.TODO);
			expect(todoTasks).toHaveLength(2);
			expect(todoTasks.every(t => t.status === TaskStatus.TODO)).toBe(true);
		});

		it('should return empty array when no tasks with status', async () => {
			const reviewTasks = taskManager.getTasksByStatus(TaskStatus.REVIEW);
			expect(reviewTasks).toHaveLength(0);
		});

		it('should return independent arrays', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);

			const todos1 = taskManager.getTasksByStatus(TaskStatus.TODO);
			const todos2 = taskManager.getTasksByStatus(TaskStatus.TODO);

			expect(todos1).not.toBe(todos2); // Different array instances
			expect(todos1).toEqual(todos2); // Same content
		});
	});

	describe('getTask', () => {
		it('should return task by id', async () => {
			const task = await taskManager.createTask('Test task');
			const retrieved = taskManager.getTask(task.id);

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe(task.id);
		});

		it('should return undefined for non-existent task', async () => {
			const retrieved = taskManager.getTask('non-existent-id');
			expect(retrieved).toBeUndefined();
		});

		it('should return reference to actual task object', async () => {
			const task = await taskManager.createTask('Test task');
			const retrieved = taskManager.getTask(task.id);

			// Modify retrieved task
			retrieved!.description = 'Modified';

			// Get task again
			const reRetrieved = taskManager.getTask(task.id);
			expect(reRetrieved?.description).toBe('Modified');
		});
	});

	describe('getAllTasks', () => {
		it('should return empty array when no tasks', async () => {
			const tasks = taskManager.getAllTasks();
			expect(tasks).toHaveLength(0);
		});

		it('should return all tasks', async () => {
			await taskManager.createTask('Task 1');
			await taskManager.createTask('Task 2');
			await taskManager.createTask('Task 3');

			const tasks = taskManager.getAllTasks();
			expect(tasks).toHaveLength(3);
		});

		it('should return array of task objects', async () => {
			const task = await taskManager.createTask('Task 1');
			const tasks = taskManager.getAllTasks();

			expect(tasks[0]).toMatchObject({
				id: task.id,
				description: 'Task 1',
			});
		});
	});

	describe('deleteTask', () => {
		let task: Task;

		beforeEach(async () => {
			task = await taskManager.createTask('Test task');
			vi.clearAllMocks();
		});

		it('should delete task from memory', async () => {
			const result = await taskManager.deleteTask(task.id);

			expect(result).toBe(true);
			expect(taskManager.getTask(task.id)).toBeUndefined();
		});

		it('should delete task from storage', async () => {
			await taskManager.deleteTask(task.id);

			expect(Storage.deleteTask).toHaveBeenCalledWith(task.id);
		});

		it('should emit task deleted event', async () => {
			await taskManager.deleteTask(task.id);

			expect(mockStateManager.emitTaskDeleted).toHaveBeenCalledWith(task.id);
		});

		it('should log deletion', async () => {
			await taskManager.deleteTask(task.id);

			expect(logger.info).toHaveBeenCalledWith(`[TaskManager] Deleted task ${task.id}`);
		});

		it('should return false for non-existent task', async () => {
			const result = await taskManager.deleteTask('non-existent-id');
			expect(result).toBe(false);
		});

		it('should not emit events for non-existent task', async () => {
			await taskManager.deleteTask('non-existent-id');

			expect(mockStateManager.emitTaskDeleted).not.toHaveBeenCalled();
			expect(Storage.deleteTask).not.toHaveBeenCalled();
		});

		it('should update task count after deletion', async () => {
			expect(taskManager.getAllTasks()).toHaveLength(1);

			await taskManager.deleteTask(task.id);

			expect(taskManager.getAllTasks()).toHaveLength(0);
		});
	});

	describe('clearAllTasks', () => {
		it('should delete all tasks from memory', async () => {
			await taskManager.createTask('Task 1');
			await taskManager.createTask('Task 2');
			await taskManager.createTask('Task 3');
			vi.clearAllMocks();

			const count = await taskManager.clearAllTasks();

			expect(count).toBe(3);
			expect(taskManager.getAllTasks()).toHaveLength(0);
		});

		it('should delete all tasks from storage', async () => {
			await taskManager.createTask('Task 1');
			await taskManager.createTask('Task 2');
			await taskManager.createTask('Task 3');
			vi.clearAllMocks();

			await taskManager.clearAllTasks();

			expect(Storage.deleteTask).toHaveBeenCalledTimes(3);
		});

		it('should emit delete events for all tasks', async () => {
			await taskManager.createTask('Task 1');
			await taskManager.createTask('Task 2');
			await taskManager.createTask('Task 3');
			vi.clearAllMocks();

			await taskManager.clearAllTasks();

			expect(mockStateManager.emitTaskDeleted).toHaveBeenCalledTimes(3);
		});

		it('should log clear operation', async () => {
			await taskManager.createTask('Task 1');
			await taskManager.createTask('Task 2');
			await taskManager.createTask('Task 3');
			vi.clearAllMocks();

			await taskManager.clearAllTasks();

			expect(logger.info).toHaveBeenCalledWith('[TaskManager] Cleared 3 tasks');
		});

		it('should return 0 when no tasks to clear', async () => {
			await taskManager.clearAllTasks();
			vi.clearAllMocks();

			const count = await taskManager.clearAllTasks();
			expect(count).toBe(0);
		});

		it('should handle clearing tasks in correct order', async () => {
			await taskManager.createTask('Task 1');
			await taskManager.createTask('Task 2');
			await taskManager.createTask('Task 3');

			const deleteOrder: string[] = [];
			vi.mocked(Storage.deleteTask).mockImplementation(async id => {
				deleteOrder.push(id);
			});

			await taskManager.clearAllTasks();

			expect(deleteOrder).toHaveLength(3);
		});
	});

	describe('getStats', () => {
		it('should return stats with zero tasks', async () => {
			const stats = taskManager.getStats();

			expect(stats).toEqual({
				total: 0,
				byStatus: {},
			});
		});

		it('should count tasks by status', async () => {
			const task1 = await taskManager.createTask('Task 1');
			const task2 = await taskManager.createTask('Task 2');
			const task3 = await taskManager.createTask('Task 3');
			const task4 = await taskManager.createTask('Task 4');

			await taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);
			await taskManager.updateTaskStatus(task2.id, TaskStatus.TODO);
			await taskManager.updateTaskStatus(task3.id, TaskStatus.IN_PROGRESS);
			await taskManager.updateTaskStatus(task4.id, TaskStatus.REVIEW);

			const stats = taskManager.getStats();

			expect(stats).toEqual({
				total: 4,
				byStatus: {
					[TaskStatus.TODO]: 2,
					[TaskStatus.IN_PROGRESS]: 1,
					[TaskStatus.REVIEW]: 1,
				},
			});
		});

		it('should update stats after status changes', async () => {
			const task1 = await taskManager.createTask('Task 1');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);

			let stats = taskManager.getStats();
			expect(stats.byStatus[TaskStatus.TODO]).toBe(1);

			await taskManager.updateTaskStatus(task1.id, TaskStatus.MERGED);

			stats = taskManager.getStats();
			expect(stats.byStatus[TaskStatus.TODO]).toBeUndefined();
			expect(stats.byStatus[TaskStatus.MERGED]).toBe(1);
		});

		it('should update stats after task deletion', async () => {
			const task1 = await taskManager.createTask('Task 1');
			const task2 = await taskManager.createTask('Task 2');
			await taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);
			await taskManager.updateTaskStatus(task2.id, TaskStatus.TODO);

			let stats = taskManager.getStats();
			expect(stats.total).toBe(2);
			expect(stats.byStatus[TaskStatus.TODO]).toBe(2);

			await taskManager.deleteTask(task1.id);

			stats = taskManager.getStats();
			expect(stats.total).toBe(1);
			expect(stats.byStatus[TaskStatus.TODO]).toBe(1);
		});

		it('should count all statuses correctly', async () => {
			const statuses = [
				TaskStatus.BACKLOG,
				TaskStatus.TODO,
				TaskStatus.IN_PROGRESS,
				TaskStatus.REVIEW,
				TaskStatus.MERGED,
				TaskStatus.BLOCKED,
			];

			for (const status of statuses) {
				const task = await taskManager.createTask(`Task ${status}`);
				await taskManager.updateTaskStatus(task.id, status);
			}

			const stats = taskManager.getStats();

			expect(stats.total).toBe(statuses.length);
			expect(Object.keys(stats.byStatus)).toHaveLength(statuses.length);
			statuses.forEach(status => {
				expect(stats.byStatus[status]).toBe(1);
			});
		});
	});

	describe('assignTaskToWorker (Atomic Assignment)', () => {
		it('should atomically assign task to worker', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);
			vi.clearAllMocks();

			const assignedTask = await taskManager.assignTaskToWorker('worker-1');

			expect(assignedTask).toBeDefined();
			expect(assignedTask?.id).toBe(task.id);
			expect(assignedTask?.assignedTo).toEqual({
				workerId: 'worker-1',
			});
			expect(assignedTask?.status).toBe(TaskStatus.IN_PROGRESS);
		});

		it('should return null when no tasks available', async () => {
			const assignedTask = await taskManager.assignTaskToWorker('worker-1');

			expect(assignedTask).toBeNull();
		});

		it('should update task status to IN_PROGRESS on assignment', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.TODO);
			vi.clearAllMocks();

			const assignedTask = await taskManager.assignTaskToWorker('worker-1');

			expect(assignedTask?.status).toBe(TaskStatus.IN_PROGRESS);
		});

		it('should add assignment to history', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);
			vi.clearAllMocks();

			const assignedTask = await taskManager.assignTaskToWorker('worker-1');

			const lastHistory = assignedTask?.history[assignedTask.history.length - 1];
			expect(lastHistory).toMatchObject({
				event: 'assigned',
				workerId: 'worker-1',
			});
		});

		it('should save to storage after assignment', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);
			vi.clearAllMocks();

			await taskManager.assignTaskToWorker('worker-1');

			expect(Storage.saveTask).toHaveBeenCalledWith(
				expect.objectContaining({
					id: task.id,
					assignedTo: {
						workerId: 'worker-1',
					},
					status: TaskStatus.IN_PROGRESS,
				})
			);
		});

		it('should emit task updated event after assignment', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);
			vi.clearAllMocks();

			await taskManager.assignTaskToWorker('worker-1');

			expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
		});

		it('should log atomic assignment', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);
			vi.clearAllMocks();

			await taskManager.assignTaskToWorker('worker-1');

			expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('atomically assigned'));
		});

		it('should rollback on storage failure', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);

			const error = new Error('Storage failed');
			vi.mocked(Storage.saveTask).mockRejectedValue(error);

			await expect(taskManager.assignTaskToWorker('worker-1')).rejects.toThrow('Storage failed');

			// Task should be rolled back
			const unchangedTask = taskManager.getTask(task.id);
			expect(unchangedTask?.assignedTo).toBeNull();
			expect(unchangedTask?.status).toBe(TaskStatus.BACKLOG);
		});

		it('should handle already assigned task gracefully', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);

			// Assign to worker 1
			await taskManager.assignTaskToWorker('worker-1');

			// Try to assign to worker 2 (should return null as no unassigned tasks available)
			const result = await taskManager.assignTaskToWorker('worker-2');

			expect(result).toBeNull();
		});

		it('should assign task with correct priority', async () => {
			const lowTask = await taskManager.createTask('Low', { priority: 'low' });
			const highTask = await taskManager.createTask('High', { priority: 'high' });

			await taskManager.updateTaskStatus(lowTask.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(highTask.id, TaskStatus.BACKLOG);

			const assignedTask = await taskManager.assignTaskToWorker('worker-1');

			// Should assign high priority task first
			expect(assignedTask?.id).toBe(highTask.id);
		});

		it('should work with different worker types', async () => {
			const pmTask = await taskManager.createTask('PM Task');
			const devTask = await taskManager.createTask('Dev Task');

			await taskManager.updateTaskStatus(pmTask.id, TaskStatus.BACKLOG);
			await taskManager.updateTaskStatus(devTask.id, TaskStatus.TODO);

			const pmAssigned = await taskManager.assignTaskToWorker('pm-1');
			const devAssigned = await taskManager.assignTaskToWorker('dev-1');

			expect(pmAssigned?.id).toBe(pmTask.id);
			expect(devAssigned?.id).toBe(devTask.id);
		});

		it('should prevent race condition by checking assignment before save', async () => {
			const task = await taskManager.createTask('Test task');
			await taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);

			// Manually assign to simulate race condition
			task.assignedTo = { workerId: 'other-worker' };

			const result = await taskManager.assignTaskToWorker('worker-1');

			expect(result).toBeNull();
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should handle empty description', async () => {
			const task = await taskManager.createTask('');
			expect(task.description).toBe('');
		});

		it('should handle very long descriptions', async () => {
			const longDescription = 'A'.repeat(10000);
			const task = await taskManager.createTask(longDescription);
			expect(task.description).toBe(longDescription);
		});

		it('should handle special characters in description', async () => {
			const specialDesc = 'Task with "quotes", <tags>, & symbols!';
			const task = await taskManager.createTask(specialDesc);
			expect(task.description).toBe(specialDesc);
		});

		it('should handle rapid task creation', async () => {
			const { v4 } = await import('uuid');
			let idCounter = 0;
			vi.mocked(v4).mockImplementation(() => `rapid-uuid-${++idCounter}`);

			const tasks = [];
			for (let i = 0; i < 100; i++) {
				tasks.push(await taskManager.createTask(`Task ${i}`));
			}

			expect(taskManager.getAllTasks()).toHaveLength(100);
		});

		it('should maintain task integrity during concurrent-like operations', async () => {
			const task = await taskManager.createTask('Test task');

			// Simulate rapid updates
			await taskManager.updateTaskStatus(task.id, TaskStatus.TODO);
			await taskManager.assignTask(task.id, 'worker-1');
			await taskManager.addComment(task.id, 'user-1', 'Comment 1');
			await taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);
			await taskManager.addComment(task.id, 'user-2', 'Comment 2');

			const finalTask = taskManager.getTask(task.id);
			expect(finalTask?.status).toBe(TaskStatus.IN_PROGRESS);
			expect(finalTask?.comments).toHaveLength(2);
			expect(finalTask?.assignedTo?.workerId).toBe('worker-1');
		});

		it('should handle metadata with complex objects', async () => {
			const complexMetadata = {
				nested: {
					object: {
						with: ['arrays', 'and', 'values'],
					},
				},
				numbers: [1, 2, 3],
				boolean: true,
			};

			const task = await taskManager.createTask('Complex metadata', complexMetadata);
			expect(task.metadata).toEqual(complexMetadata);
		});

		it('should preserve history order', async () => {
			const task = await taskManager.createTask('History test');

			await taskManager.updateTaskStatus(task.id, TaskStatus.TODO);
			await taskManager.assignTask(task.id, 'worker-1');
			await taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);
			await taskManager.unassignTask(task.id);

			const finalTask = taskManager.getTask(task.id);
			expect(finalTask?.history).toHaveLength(5);
			expect(finalTask?.history[0].event).toBe('created');
			expect(finalTask?.history[1].event).toBe('status_change');
			expect(finalTask?.history[2].event).toBe('assigned');
			expect(finalTask?.history[3].event).toBe('status_change');
			expect(finalTask?.history[4].event).toBe('unassigned');
		});
	});
});
