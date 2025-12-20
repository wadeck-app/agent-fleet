import { Storage } from 'shared-common/Storage.js';
import { Task, TaskStatus, WorkerType, TaskHistoryEntry } from 'shared-common/types.js';
import { StateManager } from 'shared-common/StateManager.js';
import { Logger } from 'shared-common/Logger.js';
import { v4 as uuidv4 } from 'uuid';

interface WorkerIdleEntry {
  workerId: string;
  requestedAt: Date;
}

export class TaskManager {
  private tasks: Map<string, Task>;
  private stateManager: StateManager;
  private initialized: boolean = false;

  // Queue system for task assignment
  private globalBacklog: Task[] = [];
  private workerQueues: Map<string, Task[]> = new Map();
  private idleWorkers: WorkerIdleEntry[] = [];

  constructor(stateManager: StateManager) {
    this.tasks = new Map();
    this.stateManager = stateManager;
  }

  /**
   * Initialize the TaskManager by loading tasks from storage
   * Must be called before using the TaskManager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await Storage.initialize();
      await this.loadTasks();
      this.initialized = true;
    } catch (error) {
      Logger.log(`[TaskManager] Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Load all tasks from storage
   */
  private async loadTasks(): Promise<void> {
    const tasks = await Storage.listTasks();
    tasks.forEach(task => {
      this.tasks.set(task.id, task);
    });
    Logger.log(`[TaskManager] Loaded ${this.tasks.size} tasks`);
  }

  /**
   * Create a new task
   */
  async createTask(
    description: string,
    metadata: Partial<Task['metadata']> = {}
  ): Promise<Task> {
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

    try {
      await Storage.saveTask(task);
    } catch (error) {
      // Rollback in-memory change if storage fails
      this.tasks.delete(task.id);
      Logger.log(`[TaskManager] Failed to create task: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    Logger.log(`[TaskManager] Created task ${task.id}: ${description.substring(0, 50)}...`);
    this.stateManager.emitTaskCreated(task);

    // Route task to appropriate queue
    if (task.assignedTo?.workerId) {
      // Task is pre-assigned to a specific worker
      this.addTaskToWorkerQueue(task.assignedTo.workerId, task);
    } else {
      // Add to global backlog
      this.addTaskToBacklog(task);
    }

    return task;
  }

  /**
   * Update an existing task in memory and storage
   * Useful when task properties are modified externally (e.g., adding flowInputs in RestAPI)
   */
  async updateTask(task: Task): Promise<void> {
    if (!this.tasks.has(task.id)) {
      throw new Error(`Task ${task.id} not found`);
    }

    const oldTask = this.tasks.get(task.id)!;
    task.updatedAt = new Date().toISOString();
    this.tasks.set(task.id, task);

    try {
      await Storage.saveTask(task);
    } catch (error) {
      // Rollback in-memory change if storage fails
      this.tasks.set(task.id, oldTask);
      Logger.log(`[TaskManager] Failed to update task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    details: Partial<TaskHistoryEntry> = {}
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldStatus = task.status;
    const oldHistory = [...task.history];

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

    try {
      await Storage.saveTask(task);
    } catch (error) {
      // Rollback in-memory changes if storage fails
      task.status = oldStatus;
      task.history = oldHistory;
      Logger.log(`[TaskManager] Failed to update task ${taskId} status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    Logger.log(`[TaskManager] Task ${taskId} status: ${oldStatus} → ${newStatus}`);
    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Assign a task to a worker
   */
  async assignTask(taskId: string, workerId: string, workerType: WorkerType): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldAssignment = task.assignedTo;
    const oldHistory = [...task.history];

    task.assignedTo = { workerId, workerType };
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'assigned',
      workerId,
      workerType
    });

    try {
      await Storage.saveTask(task);
    } catch (error) {
      // Rollback in-memory changes if storage fails
      task.assignedTo = oldAssignment;
      task.history = oldHistory;
      Logger.log(`[TaskManager] Failed to assign task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    Logger.log(`[TaskManager] Task ${taskId} assigned to ${workerType} worker ${workerId}`);
    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Unassign a task (remove assignment)
   */
  async unassignTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldAssignment = task.assignedTo;
    const oldHistory = [...task.history];

    task.assignedTo = null;
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'unassigned'
    });

    try {
      await Storage.saveTask(task);
    } catch (error) {
      // Rollback in-memory changes if storage fails
      task.assignedTo = oldAssignment;
      task.history = oldHistory;
      Logger.log(`[TaskManager] Failed to unassign task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    Logger.log(`[TaskManager] Task ${taskId} unassigned`);
    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Add a comment to a task
   */
  async addComment(taskId: string, author: string, content: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldComments = [...task.comments];

    task.comments.push({
      timestamp: new Date().toISOString(),
      author,
      content
    });

    task.updatedAt = new Date().toISOString();

    try {
      await Storage.saveTask(task);
    } catch (error) {
      // Rollback in-memory changes if storage fails
      task.comments = oldComments;
      Logger.log(`[TaskManager] Failed to add comment to task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    this.stateManager.emitTaskUpdated(task);
  }

  /**
   * Get the next available task for a worker type (without assigning it)
   * Note: This method is kept for backward compatibility but should not be used
   * in scenarios where race conditions are a concern. Use assignTaskToWorker instead.
   */
  getNextTaskForWorker(workerType: WorkerType): Task | null {
    return this.getNextAvailableTask(workerType);
  }

  /**
   * Internal method to find the next available task for a worker type
   */
  private getNextAvailableTask(workerType: WorkerType): Task | null {
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
   * Atomically finds and assigns the next available task to a worker.
   * Returns the assigned task or null if no tasks are available.
   * This prevents race conditions where multiple workers claim the same task.
   */
  async assignTaskToWorker(workerId: string, workerType: WorkerType): Promise<Task | null> {
    // Find next available task
    const task = this.getNextAvailableTask(workerType);

    if (!task) {
      return null;
    }

    // Verify task is still unassigned (defensive check)
    if (task.assignedTo) {
      Logger.log(`[TaskManager] Task ${task.id} already assigned, skipping`);
      return null;
    }

    // Atomic assignment - update task state
    const oldAssignment = task.assignedTo;
    const oldStatus = task.status;
    const oldHistory = [...task.history];

    task.assignedTo = { workerId, workerType };
    task.status = TaskStatus.IN_PROGRESS;
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'assigned',
      workerId,
      workerType
    });

    try {
      await Storage.saveTask(task);
      Logger.log(`[TaskManager] Task ${task.id} atomically assigned to ${workerType} worker ${workerId}`);
      this.stateManager.emitTaskUpdated(task);
      return task;
    } catch (error) {
      // Rollback in-memory changes if storage fails
      task.assignedTo = oldAssignment;
      task.status = oldStatus;
      task.history = oldHistory;
      Logger.log(`[TaskManager] Failed to atomically assign task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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
  async deleteTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    try {
      // Remove from storage first
      await Storage.deleteTask(taskId);

      // Remove from memory
      this.tasks.delete(taskId);

      Logger.log(`[TaskManager] Deleted task ${taskId}`);
      this.stateManager.emitTaskDeleted(taskId);
      return true;
    } catch (error) {
      Logger.log(`[TaskManager] Failed to delete task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Clear all tasks
   */
  async clearAllTasks(): Promise<number> {
    const taskIds = Array.from(this.tasks.keys());
    const count = taskIds.length;

    try {
      // Delete all from storage in parallel
      await Promise.all(taskIds.map(taskId => Storage.deleteTask(taskId)));

      // Remove from memory and emit events
      for (const taskId of taskIds) {
        this.tasks.delete(taskId);
        this.stateManager.emitTaskDeleted(taskId);
      }

      Logger.log(`[TaskManager] Cleared ${count} tasks`);
      return count;
    } catch (error) {
      Logger.log(`[TaskManager] Failed to clear all tasks: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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

  /**
   * Add a task to the global backlog
   */
  addTaskToBacklog(task: Task): void {
    this.globalBacklog.push(task);
    Logger.log(`[TaskManager] Added task ${task.id} to global backlog`);
  }

  /**
   * Add a task to a specific worker's queue
   */
  addTaskToWorkerQueue(workerId: string, task: Task): void {
    let queue = this.workerQueues.get(workerId);
    if (!queue) {
      queue = [];
      this.workerQueues.set(workerId, queue);
    }
    queue.push(task);
    Logger.log(`[TaskManager] Added task ${task.id} to worker ${workerId} queue`);
  }

  /**
   * Mark a worker as idle (waiting for tasks)
   */
  markWorkerIdle(workerId: string): void {
    // Check if worker is already in idle list
    const existingIndex = this.idleWorkers.findIndex(w => w.workerId === workerId);
    if (existingIndex === -1) {
      this.idleWorkers.push({
        workerId,
        requestedAt: new Date()
      });
      Logger.log(`[TaskManager] Worker ${workerId} marked as idle`);
    }
  }

  /**
   * Mark a worker as busy (working on a task)
   */
  markWorkerBusy(workerId: string, task: Task): void {
    // Remove from idle workers
    const index = this.idleWorkers.findIndex(w => w.workerId === workerId);
    if (index !== -1) {
      this.idleWorkers.splice(index, 1);
      Logger.log(`[TaskManager] Worker ${workerId} marked as busy with task ${task.id}`);
    }
  }

  /**
   * Find a matching task for a worker
   * Checks worker's personal queue first, then global backlog
   * @param workerId - The worker requesting a task
   * @returns Task or null if no matching task found
   */
  findMatchingTask(workerId: string): Task | null {
    // Check worker's personal queue first
    const workerQueue = this.workerQueues.get(workerId);
    if (workerQueue && workerQueue.length > 0) {
      const task = workerQueue.shift()!;
      Logger.log(`[TaskManager] Found task ${task.id} in worker ${workerId} personal queue`);
      return task;
    }

    // Check global backlog
    if (this.globalBacklog.length > 0) {
      // For now, just return the first task (FIFO)
      // In Phase 5, we'll add flow compatibility checking
      const task = this.globalBacklog.shift()!;
      Logger.log(`[TaskManager] Found task ${task.id} in global backlog for worker ${workerId}`);
      return task;
    }

    return null;
  }
}
