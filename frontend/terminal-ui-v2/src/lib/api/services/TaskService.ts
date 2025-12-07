/**
 * TaskService - Business logic and data transformation for Tasks
 * Contains helper methods for formatting and managing task data
 */

import { Task, CreateTaskDTO } from '@/types/domain';
import { TaskRepository, taskRepository } from '../repositories/TaskRepository';

export class TaskService {
  constructor(private repository: TaskRepository = taskRepository) {}

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    return this.repository.getAllTasks();
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskDTO): Promise<Task> {
    return this.repository.createTask(data);
  }

  /**
   * Subscribe to task updates
   */
  subscribeToTasks(callback: (tasks: Task[]) => void): () => void {
    return this.repository.subscribeToTasks(callback);
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: Task['status']): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter((task) => task.status === status);
  }

  /**
   * Get active (running or queued) tasks
   */
  async getActiveTasks(): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter((task) => task.status === 'running' || task.status === 'queued');
  }

  /**
   * Get human-readable task status label
   */
  getTaskStatusLabel(status: Task['status']): string {
    const labels: Record<Task['status'], string> = {
      queued: 'Queued',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
    };
    return labels[status];
  }

  /**
   * Get task status color for UI
   */
  getTaskStatusColor(status: Task['status']): string {
    const colors: Record<Task['status'], string> = {
      queued: 'info',
      running: 'warning',
      completed: 'success',
      failed: 'error',
    };
    return colors[status];
  }

  /**
   * Get human-readable task type label
   */
  getTaskTypeLabel(type: Task['type']): string {
    const labels: Record<Task['type'], string> = {
      flow: 'Flow',
      command: 'Command',
    };
    return labels[type];
  }

  /**
   * Format task duration
   */
  formatTaskDuration(task: Task): string | null {
    if (!task.startedAt) return null;

    const endTime = task.completedAt || new Date();
    const durationMs = endTime.getTime() - task.startedAt.getTime();
    const durationSec = Math.floor(durationMs / 1000);

    if (durationSec < 60) {
      return `${durationSec}s`;
    }

    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Check if task is active (running or queued)
   */
  isTaskActive(task: Task): boolean {
    return task.status === 'running' || task.status === 'queued';
  }

  /**
   * Check if task is completed (completed or failed)
   */
  isTaskCompleted(task: Task): boolean {
    return task.status === 'completed' || task.status === 'failed';
  }
}

export const taskService = new TaskService();
