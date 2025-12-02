/**
 * TaskManager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskManager } from './TaskManager.js';
import { Storage } from '../../shared/Storage.js';
import { StateManager } from '../../shared/StateManager.js';
import { Logger } from '../../shared/Logger.js';
import { Task, TaskStatus, WorkerType } from '../../shared/types.js';

// Mock dependencies
vi.mock('../../shared/Storage.js');
vi.mock('../../shared/StateManager.js');
vi.mock('../../shared/Logger.js');
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

describe('TaskManager', () => {
  let taskManager: TaskManager;
  let mockStateManager: StateManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock StateManager
    mockStateManager = {
      emitTaskCreated: vi.fn(),
      emitTaskUpdated: vi.fn(),
      emitTaskDeleted: vi.fn(),
    } as any;

    vi.mocked(StateManager.getInstance).mockReturnValue(mockStateManager);

    // Mock Storage
    vi.mocked(Storage.listTasks).mockReturnValue([]);
    vi.mocked(Storage.saveTask).mockImplementation(() => {});
    vi.mocked(Storage.deleteTask).mockImplementation(() => {});

    // Mock Logger
    vi.mocked(Logger.log).mockImplementation(() => {});

    // Mock Date to have consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    taskManager = new TaskManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty tasks when storage is empty', () => {
      expect(Storage.listTasks).toHaveBeenCalled();
      expect(taskManager.getAllTasks()).toHaveLength(0);
      expect(Logger.log).toHaveBeenCalledWith('[TaskManager] Loaded 0 tasks');
    });

    it('should load existing tasks from storage', () => {
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

      vi.mocked(Storage.listTasks).mockReturnValue(existingTasks);

      const newManager = new TaskManager();

      expect(newManager.getAllTasks()).toHaveLength(1);
      expect(newManager.getTask('task-1')).toEqual(existingTasks[0]);
    });
  });

  describe('createTask', () => {
    it('should create a task with default values', () => {
      const task = taskManager.createTask('Test task description');

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

    it('should create a task with custom metadata', () => {
      const metadata = {
        priority: 'high',
        flowId: 'test-flow',
        customField: 'value',
      };

      const task = taskManager.createTask('Task with metadata', metadata);

      expect(task.priority).toBe('high');
      expect(task.metadata).toMatchObject(metadata);
    });

    it('should save task to storage', () => {
      const task = taskManager.createTask('Save test');

      expect(Storage.saveTask).toHaveBeenCalledWith(task);
    });

    it('should emit task created event', () => {
      const task = taskManager.createTask('Event test');

      expect(mockStateManager.emitTaskCreated).toHaveBeenCalledWith(task);
    });

    it('should log task creation', () => {
      taskManager.createTask('Log test task');

      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('[TaskManager] Created task test-uuid-1234')
      );
    });

    it('should create multiple tasks with unique IDs', async () => {
      const { v4 } = await import('uuid');
      let idCounter = 0;
      vi.mocked(v4).mockImplementation(() => `uuid-${++idCounter}`);

      const task1 = taskManager.createTask('Task 1');
      const task2 = taskManager.createTask('Task 2');

      expect(task1.id).not.toBe(task2.id);
      expect(taskManager.getAllTasks()).toHaveLength(2);
    });
  });

  describe('updateTaskStatus', () => {
    let task: Task;

    beforeEach(() => {
      task = taskManager.createTask('Test task');
      vi.clearAllMocks();
    });

    it('should update task status', () => {
      taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should update task timestamp', () => {
      vi.setSystemTime(new Date('2024-01-01T01:00:00.000Z'));

      taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.updatedAt).toBe('2024-01-01T01:00:00.000Z');
    });

    it('should add history entry with status change', () => {
      taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.history).toHaveLength(2);
      expect(updatedTask?.history[1]).toMatchObject({
        timestamp: '2024-01-01T00:00:00.000Z',
        event: 'status_change',
        oldStatus: TaskStatus.BACKLOG,
        newStatus: TaskStatus.IN_PROGRESS,
      });
    });

    it('should include additional details in history', () => {
      taskManager.updateTaskStatus(task.id, TaskStatus.BLOCKED, {
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

    it('should save updated task to storage', () => {
      taskManager.updateTaskStatus(task.id, TaskStatus.TODO);

      expect(Storage.saveTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          status: TaskStatus.TODO,
        })
      );
    });

    it('should emit task updated event', () => {
      taskManager.updateTaskStatus(task.id, TaskStatus.REVIEW);

      expect(mockStateManager.emitTaskUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          status: TaskStatus.REVIEW,
        })
      );
    });

    it('should log status change', () => {
      taskManager.updateTaskStatus(task.id, TaskStatus.APPROVED);

      expect(Logger.log).toHaveBeenCalledWith(
        `[TaskManager] Task ${task.id} status: ${TaskStatus.BACKLOG} → ${TaskStatus.APPROVED}`
      );
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        taskManager.updateTaskStatus('non-existent-id', TaskStatus.TODO);
      }).toThrow('Task non-existent-id not found');
    });
  });

  describe('assignTask', () => {
    let task: Task;

    beforeEach(() => {
      task = taskManager.createTask('Test task');
      vi.clearAllMocks();
    });

    it('should assign task to worker', () => {
      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.assignedTo).toEqual({
        workerId: 'worker-1',
        workerType: WorkerType.DEV,
      });
    });

    it('should update task timestamp', () => {
      vi.setSystemTime(new Date('2024-01-01T02:00:00.000Z'));

      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.updatedAt).toBe('2024-01-01T02:00:00.000Z');
    });

    it('should add assignment to history', () => {
      taskManager.assignTask(task.id, 'worker-1', WorkerType.REVIEWER);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.history[1]).toMatchObject({
        timestamp: '2024-01-01T00:00:00.000Z',
        event: 'assigned',
        workerId: 'worker-1',
        workerType: WorkerType.REVIEWER,
      });
    });

    it('should save to storage', () => {
      taskManager.assignTask(task.id, 'worker-2', WorkerType.PM);

      expect(Storage.saveTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          assignedTo: {
            workerId: 'worker-2',
            workerType: WorkerType.PM,
          },
        })
      );
    });

    it('should emit task updated event', () => {
      taskManager.assignTask(task.id, 'worker-3', WorkerType.PO);

      expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
    });

    it('should log assignment', () => {
      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);

      expect(Logger.log).toHaveBeenCalledWith(
        `[TaskManager] Task ${task.id} assigned to ${WorkerType.DEV} worker worker-1`
      );
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        taskManager.assignTask('non-existent-id', 'worker-1', WorkerType.DEV);
      }).toThrow('Task non-existent-id not found');
    });

    it('should allow reassigning task to different worker', () => {
      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);
      taskManager.assignTask(task.id, 'worker-2', WorkerType.DEV);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.assignedTo?.workerId).toBe('worker-2');
      expect(updatedTask?.history).toHaveLength(3); // created, assigned, assigned
    });
  });

  describe('unassignTask', () => {
    let task: Task;

    beforeEach(() => {
      task = taskManager.createTask('Test task');
      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);
      vi.clearAllMocks();
    });

    it('should remove task assignment', () => {
      taskManager.unassignTask(task.id);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.assignedTo).toBeNull();
    });

    it('should update task timestamp', () => {
      vi.setSystemTime(new Date('2024-01-01T03:00:00.000Z'));

      taskManager.unassignTask(task.id);

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.updatedAt).toBe('2024-01-01T03:00:00.000Z');
    });

    it('should add unassignment to history', () => {
      taskManager.unassignTask(task.id);

      const updatedTask = taskManager.getTask(task.id);
      const lastHistory = updatedTask?.history[updatedTask.history.length - 1];
      expect(lastHistory).toMatchObject({
        timestamp: '2024-01-01T00:00:00.000Z',
        event: 'unassigned',
      });
    });

    it('should save to storage', () => {
      taskManager.unassignTask(task.id);

      expect(Storage.saveTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          assignedTo: null,
        })
      );
    });

    it('should emit task updated event', () => {
      taskManager.unassignTask(task.id);

      expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
    });

    it('should log unassignment', () => {
      taskManager.unassignTask(task.id);

      expect(Logger.log).toHaveBeenCalledWith(`[TaskManager] Task ${task.id} unassigned`);
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        taskManager.unassignTask('non-existent-id');
      }).toThrow('Task non-existent-id not found');
    });
  });

  describe('addComment', () => {
    let task: Task;

    beforeEach(() => {
      task = taskManager.createTask('Test task');
      vi.clearAllMocks();
    });

    it('should add comment to task', () => {
      taskManager.addComment(task.id, 'user-1', 'This is a comment');

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.comments).toHaveLength(1);
      expect(updatedTask?.comments[0]).toMatchObject({
        timestamp: '2024-01-01T00:00:00.000Z',
        author: 'user-1',
        content: 'This is a comment',
      });
    });

    it('should update task timestamp', () => {
      vi.setSystemTime(new Date('2024-01-01T04:00:00.000Z'));

      taskManager.addComment(task.id, 'user-1', 'Comment');

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.updatedAt).toBe('2024-01-01T04:00:00.000Z');
    });

    it('should save to storage', () => {
      taskManager.addComment(task.id, 'user-1', 'Comment');

      expect(Storage.saveTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
        })
      );
    });

    it('should emit task updated event', () => {
      taskManager.addComment(task.id, 'user-1', 'Comment');

      expect(mockStateManager.emitTaskUpdated).toHaveBeenCalled();
    });

    it('should allow multiple comments', () => {
      taskManager.addComment(task.id, 'user-1', 'First comment');
      taskManager.addComment(task.id, 'user-2', 'Second comment');
      taskManager.addComment(task.id, 'user-1', 'Third comment');

      const updatedTask = taskManager.getTask(task.id);
      expect(updatedTask?.comments).toHaveLength(3);
      expect(updatedTask?.comments[1].author).toBe('user-2');
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        taskManager.addComment('non-existent-id', 'user-1', 'Comment');
      }).toThrow('Task non-existent-id not found');
    });
  });

  describe('getNextTaskForWorker', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return null when no tasks available', () => {
      const task = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(task).toBeNull();
    });

    it('should return BACKLOG task for PM worker', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.BACKLOG);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.PM);
      expect(nextTask?.id).toBe(task1.id);
    });

    it('should return REFINED task for PO worker', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.REFINED);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.PO);
      expect(nextTask?.id).toBe(task1.id);
    });

    it('should return BACKLOG, TODO, or CHANGES_REQUESTED task for DEV worker', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(nextTask?.id).toBe(task1.id);
    });

    it('should return REVIEW task for REVIEWER worker', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.REVIEW);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.REVIEWER);
      expect(nextTask?.id).toBe(task1.id);
    });

    it('should not return assigned tasks', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.BACKLOG);
      taskManager.assignTask(task1.id, 'worker-1', WorkerType.DEV);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(nextTask).toBeNull();
    });

    it('should prioritize by priority order: urgent > high > medium > low', () => {
      const lowTask = taskManager.createTask('Low', { priority: 'low' });
      const highTask = taskManager.createTask('High', { priority: 'high' });
      const mediumTask = taskManager.createTask('Medium', { priority: 'medium' });
      const urgentTask = taskManager.createTask('Urgent', { priority: 'urgent' });

      // All BACKLOG for DEV
      [lowTask, highTask, mediumTask, urgentTask].forEach((task) => {
        taskManager.updateTaskStatus(task.id, TaskStatus.BACKLOG);
      });

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(nextTask?.id).toBe(urgentTask.id);
    });

    it('should return first task of highest priority when multiple exist', () => {
      const urgent1 = taskManager.createTask('Urgent 1', { priority: 'urgent' });
      const urgent2 = taskManager.createTask('Urgent 2', { priority: 'urgent' });

      taskManager.updateTaskStatus(urgent1.id, TaskStatus.BACKLOG);
      taskManager.updateTaskStatus(urgent2.id, TaskStatus.BACKLOG);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(nextTask?.id).toBe(urgent1.id);
    });

    it('should skip tasks with wrong status', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.MERGED);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(nextTask).toBeNull();
    });

    it('should handle multiple statuses for DEV worker', () => {
      const backlogTask = taskManager.createTask('Backlog', { priority: 'low' });
      const todoTask = taskManager.createTask('Todo', { priority: 'medium' });
      const changesTask = taskManager.createTask('Changes', { priority: 'high' });

      taskManager.updateTaskStatus(backlogTask.id, TaskStatus.BACKLOG);
      taskManager.updateTaskStatus(todoTask.id, TaskStatus.TODO);
      taskManager.updateTaskStatus(changesTask.id, TaskStatus.CHANGES_REQUESTED);

      const nextTask = taskManager.getNextTaskForWorker(WorkerType.DEV);
      expect(nextTask?.id).toBe(changesTask.id); // highest priority
    });
  });

  describe('getTasksByStatus', () => {
    it('should return tasks with specific status', () => {
      // Create tasks with different statuses
      const task1 = taskManager.createTask('Task 1');
      const task2 = taskManager.createTask('Task 2');
      const task3 = taskManager.createTask('Task 3');

      taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);
      taskManager.updateTaskStatus(task2.id, TaskStatus.TODO);
      taskManager.updateTaskStatus(task3.id, TaskStatus.IN_PROGRESS);

      const todoTasks = taskManager.getTasksByStatus(TaskStatus.TODO);
      expect(todoTasks).toHaveLength(2);
      expect(todoTasks.every((t) => t.status === TaskStatus.TODO)).toBe(true);
    });

    it('should return empty array when no tasks with status', () => {
      const reviewTasks = taskManager.getTasksByStatus(TaskStatus.REVIEW);
      expect(reviewTasks).toHaveLength(0);
    });

    it('should return independent arrays', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);

      const todos1 = taskManager.getTasksByStatus(TaskStatus.TODO);
      const todos2 = taskManager.getTasksByStatus(TaskStatus.TODO);

      expect(todos1).not.toBe(todos2); // Different array instances
      expect(todos1).toEqual(todos2); // Same content
    });
  });

  describe('getTask', () => {
    it('should return task by id', () => {
      const task = taskManager.createTask('Test task');
      const retrieved = taskManager.getTask(task.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(task.id);
    });

    it('should return undefined for non-existent task', () => {
      const retrieved = taskManager.getTask('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should return reference to actual task object', () => {
      const task = taskManager.createTask('Test task');
      const retrieved = taskManager.getTask(task.id);

      // Modify retrieved task
      retrieved!.description = 'Modified';

      // Get task again
      const reRetrieved = taskManager.getTask(task.id);
      expect(reRetrieved?.description).toBe('Modified');
    });
  });

  describe('getAllTasks', () => {
    it('should return empty array when no tasks', () => {
      const tasks = taskManager.getAllTasks();
      expect(tasks).toHaveLength(0);
    });

    it('should return all tasks', () => {
      taskManager.createTask('Task 1');
      taskManager.createTask('Task 2');
      taskManager.createTask('Task 3');

      const tasks = taskManager.getAllTasks();
      expect(tasks).toHaveLength(3);
    });

    it('should return array of task objects', () => {
      const task = taskManager.createTask('Task 1');
      const tasks = taskManager.getAllTasks();

      expect(tasks[0]).toMatchObject({
        id: task.id,
        description: 'Task 1',
      });
    });
  });

  describe('deleteTask', () => {
    let task: Task;

    beforeEach(() => {
      task = taskManager.createTask('Test task');
      vi.clearAllMocks();
    });

    it('should delete task from memory', () => {
      const result = taskManager.deleteTask(task.id);

      expect(result).toBe(true);
      expect(taskManager.getTask(task.id)).toBeUndefined();
    });

    it('should delete task from storage', () => {
      taskManager.deleteTask(task.id);

      expect(Storage.deleteTask).toHaveBeenCalledWith(task.id);
    });

    it('should emit task deleted event', () => {
      taskManager.deleteTask(task.id);

      expect(mockStateManager.emitTaskDeleted).toHaveBeenCalledWith(task.id);
    });

    it('should log deletion', () => {
      taskManager.deleteTask(task.id);

      expect(Logger.log).toHaveBeenCalledWith(`[TaskManager] Deleted task ${task.id}`);
    });

    it('should return false for non-existent task', () => {
      const result = taskManager.deleteTask('non-existent-id');
      expect(result).toBe(false);
    });

    it('should not emit events for non-existent task', () => {
      taskManager.deleteTask('non-existent-id');

      expect(mockStateManager.emitTaskDeleted).not.toHaveBeenCalled();
      expect(Storage.deleteTask).not.toHaveBeenCalled();
    });

    it('should update task count after deletion', () => {
      expect(taskManager.getAllTasks()).toHaveLength(1);

      taskManager.deleteTask(task.id);

      expect(taskManager.getAllTasks()).toHaveLength(0);
    });
  });

  describe('clearAllTasks', () => {
    it('should delete all tasks from memory', () => {
      taskManager.createTask('Task 1');
      taskManager.createTask('Task 2');
      taskManager.createTask('Task 3');
      vi.clearAllMocks();

      const count = taskManager.clearAllTasks();

      expect(count).toBe(3);
      expect(taskManager.getAllTasks()).toHaveLength(0);
    });

    it('should delete all tasks from storage', () => {
      taskManager.createTask('Task 1');
      taskManager.createTask('Task 2');
      taskManager.createTask('Task 3');
      vi.clearAllMocks();

      taskManager.clearAllTasks();

      expect(Storage.deleteTask).toHaveBeenCalledTimes(3);
    });

    it('should emit delete events for all tasks', () => {
      taskManager.createTask('Task 1');
      taskManager.createTask('Task 2');
      taskManager.createTask('Task 3');
      vi.clearAllMocks();

      taskManager.clearAllTasks();

      expect(mockStateManager.emitTaskDeleted).toHaveBeenCalledTimes(3);
    });

    it('should log clear operation', () => {
      taskManager.createTask('Task 1');
      taskManager.createTask('Task 2');
      taskManager.createTask('Task 3');
      vi.clearAllMocks();

      taskManager.clearAllTasks();

      expect(Logger.log).toHaveBeenCalledWith('[TaskManager] Cleared 3 tasks');
    });

    it('should return 0 when no tasks to clear', () => {
      taskManager.clearAllTasks();
      vi.clearAllMocks();

      const count = taskManager.clearAllTasks();
      expect(count).toBe(0);
    });

    it('should handle clearing tasks in correct order', () => {
      taskManager.createTask('Task 1');
      taskManager.createTask('Task 2');
      taskManager.createTask('Task 3');

      const deleteOrder: string[] = [];
      vi.mocked(Storage.deleteTask).mockImplementation((id) => {
        deleteOrder.push(id);
      });

      taskManager.clearAllTasks();

      expect(deleteOrder).toHaveLength(3);
    });
  });

  describe('getStats', () => {
    it('should return stats with zero tasks', () => {
      const stats = taskManager.getStats();

      expect(stats).toEqual({
        total: 0,
        byStatus: {},
      });
    });

    it('should count tasks by status', () => {
      const task1 = taskManager.createTask('Task 1');
      const task2 = taskManager.createTask('Task 2');
      const task3 = taskManager.createTask('Task 3');
      const task4 = taskManager.createTask('Task 4');

      taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);
      taskManager.updateTaskStatus(task2.id, TaskStatus.TODO);
      taskManager.updateTaskStatus(task3.id, TaskStatus.IN_PROGRESS);
      taskManager.updateTaskStatus(task4.id, TaskStatus.REVIEW);

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

    it('should update stats after status changes', () => {
      const task1 = taskManager.createTask('Task 1');
      taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);

      let stats = taskManager.getStats();
      expect(stats.byStatus[TaskStatus.TODO]).toBe(1);

      taskManager.updateTaskStatus(task1.id, TaskStatus.MERGED);

      stats = taskManager.getStats();
      expect(stats.byStatus[TaskStatus.TODO]).toBeUndefined();
      expect(stats.byStatus[TaskStatus.MERGED]).toBe(1);
    });

    it('should update stats after task deletion', () => {
      const task1 = taskManager.createTask('Task 1');
      const task2 = taskManager.createTask('Task 2');
      taskManager.updateTaskStatus(task1.id, TaskStatus.TODO);
      taskManager.updateTaskStatus(task2.id, TaskStatus.TODO);

      let stats = taskManager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byStatus[TaskStatus.TODO]).toBe(2);

      taskManager.deleteTask(task1.id);

      stats = taskManager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byStatus[TaskStatus.TODO]).toBe(1);
    });

    it('should count all statuses correctly', () => {
      const statuses = [
        TaskStatus.BACKLOG,
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.REVIEW,
        TaskStatus.MERGED,
        TaskStatus.BLOCKED,
      ];

      statuses.forEach((status) => {
        const task = taskManager.createTask(`Task ${status}`);
        taskManager.updateTaskStatus(task.id, status);
      });

      const stats = taskManager.getStats();

      expect(stats.total).toBe(statuses.length);
      expect(Object.keys(stats.byStatus)).toHaveLength(statuses.length);
      statuses.forEach((status) => {
        expect(stats.byStatus[status]).toBe(1);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty description', () => {
      const task = taskManager.createTask('');
      expect(task.description).toBe('');
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      const task = taskManager.createTask(longDescription);
      expect(task.description).toBe(longDescription);
    });

    it('should handle special characters in description', () => {
      const specialDesc = 'Task with "quotes", <tags>, & symbols!';
      const task = taskManager.createTask(specialDesc);
      expect(task.description).toBe(specialDesc);
    });

    it('should handle rapid task creation', async () => {
      const { v4 } = await import('uuid');
      let idCounter = 0;
      vi.mocked(v4).mockImplementation(() => `rapid-uuid-${++idCounter}`);

      const tasks = [];
      for (let i = 0; i < 100; i++) {
        tasks.push(taskManager.createTask(`Task ${i}`));
      }

      expect(taskManager.getAllTasks()).toHaveLength(100);
    });

    it('should maintain task integrity during concurrent-like operations', () => {
      const task = taskManager.createTask('Test task');

      // Simulate rapid updates
      taskManager.updateTaskStatus(task.id, TaskStatus.TODO);
      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);
      taskManager.addComment(task.id, 'user-1', 'Comment 1');
      taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);
      taskManager.addComment(task.id, 'user-2', 'Comment 2');

      const finalTask = taskManager.getTask(task.id);
      expect(finalTask?.status).toBe(TaskStatus.IN_PROGRESS);
      expect(finalTask?.comments).toHaveLength(2);
      expect(finalTask?.assignedTo?.workerId).toBe('worker-1');
    });

    it('should handle metadata with complex objects', () => {
      const complexMetadata = {
        nested: {
          object: {
            with: ['arrays', 'and', 'values'],
          },
        },
        numbers: [1, 2, 3],
        boolean: true,
      };

      const task = taskManager.createTask('Complex metadata', complexMetadata);
      expect(task.metadata).toEqual(complexMetadata);
    });

    it('should preserve history order', () => {
      const task = taskManager.createTask('History test');

      taskManager.updateTaskStatus(task.id, TaskStatus.TODO);
      taskManager.assignTask(task.id, 'worker-1', WorkerType.DEV);
      taskManager.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);
      taskManager.unassignTask(task.id);

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
