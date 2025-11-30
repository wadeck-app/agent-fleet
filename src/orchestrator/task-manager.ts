import { Storage } from '../shared/storage.js';
import { Task, TaskStatus, WorkerType, TaskHistoryEntry } from '../shared/types.js';
import { StateManager } from '../shared/state-manager.js';
import { Logger } from '../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class TaskManager {
  private tasks: Map<string, Task>;
  private stateManager: StateManager;

  constructor() {
    this.tasks = new Map();
    this.stateManager = StateManager.getInstance();
    this.loadTasks();
  }

  /**
   * Load all tasks from storage
   */
  private loadTasks(): void {
    const tasks = Storage.listTasks();
    tasks.forEach(task => {
      this.tasks.set(task.id, task);
    });
    Logger.log(`[TaskManager] Loaded ${this.tasks.size} tasks`);
  }

  /**
   * Create a new task
   */
  createTask(
    description: string,
    metadata: Partial<Task['metadata']> = {}
  ): Task {
    const task: Task = {
      id: uuidv4(),
      description,
      status: TaskStatus.BACKLOG,
      priority: (metadata.priority as Task['priority']) || 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: null,
      comments: [],
      metadata: {
        ...metadata
      },
      history: [{
        timestamp: new Date().toISOString(),
        event: 'created',
        status: TaskStatus.BACKLOG
      }]
    };

    this.tasks.set(task.id, task);
    Storage.saveTask(task);
    Logger.log(`[TaskManager] Created task ${task.id}: ${description.substring(0, 50)}...`);

    this.stateManager.emitTaskCreated(task);
    return task;
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    details: Partial<TaskHistoryEntry> = {}
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldStatus = task.status;
    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    // Add to history
    task.history.push({
      timestamp: task.updatedAt,
      event: 'status_change',
      oldStatus,
      newStatus,
      ...details
    });

    Storage.saveTask(task);
    Logger.log(`[TaskManager] Task ${taskId} status: ${oldStatus} → ${newStatus}`);

    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Assign a task to a worker
   */
  assignTask(taskId: string, workerId: string, workerType: WorkerType): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.assignedTo = { workerId, workerType };
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'assigned',
      workerId,
      workerType
    });

    Storage.saveTask(task);
    Logger.log(`[TaskManager] Task ${taskId} assigned to ${workerType} worker ${workerId}`);

    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Unassign a task (remove assignment)
   */
  unassignTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.assignedTo = null;
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'unassigned'
    });

    Storage.saveTask(task);
    Logger.log(`[TaskManager] Task ${taskId} unassigned`);

    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Add a comment to a task
   */
  addComment(taskId: string, author: string, content: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.comments.push({
      timestamp: new Date().toISOString(),
      author,
      content
    });

    task.updatedAt = new Date().toISOString();
    Storage.saveTask(task);

    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Get the next task for a worker type
   */
  getNextTaskForWorker(workerType: WorkerType): Task | null {
    // Determine which status to look for based on worker type
    const statusMap: Record<WorkerType, TaskStatus[]> = {
      [WorkerType.PM]: [TaskStatus.BACKLOG],
      [WorkerType.PO]: [TaskStatus.REFINED],
      // DEV accepts BACKLOG for MVP (until we have PM workers)
      [WorkerType.DEV]: [TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.CHANGES_REQUESTED],
      [WorkerType.REVIEWER]: [TaskStatus.REVIEW]
    };

    const targetStatuses = statusMap[workerType] || [];

    // Find the first unassigned task with the right status
    // Prioritize by priority: urgent > high > medium > low
    const priorityOrder: Task['priority'][] = ['urgent', 'high', 'medium', 'low'];

    for (const priority of priorityOrder) {
      for (const task of this.tasks.values()) {
        if (
          targetStatuses.includes(task.status) &&
          !task.assignedTo &&
          task.priority === priority
        ) {
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Get all tasks with a given status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === status);
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Remove from storage
    Storage.deleteTask(taskId);

    // Remove from memory
    this.tasks.delete(taskId);

    Logger.log(`[TaskManager] Deleted task ${taskId}`);

    this.stateManager.emitTaskDeleted(taskId);
    return true;
  }

  /**
   * Clear all tasks
   */
  clearAllTasks(): number {
    const count = this.tasks.size;

    // Delete all from storage and emit events
    for (const taskId of this.tasks.keys()) {
      Storage.deleteTask(taskId);
      this.stateManager.emitTaskDeleted(taskId);
    }

    // Clear memory
    this.tasks.clear();

    Logger.log(`[TaskManager] Cleared ${count} tasks`);
    return count;
  }

  /**
   * Get statistics
   */
  getStats() {
    const byStatus: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    }

    return {
      total: this.tasks.size,
      byStatus
    };
  }
}
