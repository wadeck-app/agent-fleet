/**
 * Task business logic and data transformation
 */

import { Task, TaskStatus } from '@/types/domain';
import { TaskRepository, CreateTaskDTO } from '../repositories/TaskRepository';

export class TaskService {
  constructor(private repository: TaskRepository) {}

  async getAllTasks(): Promise<Task[]> {
    const tasks = await this.repository.getAllTasks();
    return this.sortTasksByPriority(tasks);
  }

  async getActiveTasks(): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter((task) =>
      [TaskStatus.IN_PROGRESS, TaskStatus.TESTING, TaskStatus.REVIEWING].includes(task.status)
    );
  }

  async getPendingTasks(): Promise<Task[]> {
    const tasks = await this.getAllTasks();
    return tasks.filter((task) =>
      [TaskStatus.BACKLOG, TaskStatus.TODO, TaskStatus.CHANGES_REQUESTED].includes(task.status)
    );
  }

  async createTask(data: CreateTaskDTO): Promise<Task> {
    return this.repository.createTask(data);
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    return this.repository.updateTaskStatus(id, status);
  }

  async deleteTask(id: string): Promise<void> {
    return this.repository.deleteTask(id);
  }

  private sortTasksByPriority(tasks: Task[]): Task[] {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return [...tasks].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  getTaskStatusColor(status: TaskStatus): string {
    const colorMap: Record<TaskStatus, string> = {
      [TaskStatus.BACKLOG]: '#64748b',
      [TaskStatus.REFINING]: '#64748b',
      [TaskStatus.REFINED]: '#64748b',
      [TaskStatus.PRIORITIZING]: '#64748b',
      [TaskStatus.TODO]: '#3b82f6',
      [TaskStatus.IN_PROGRESS]: '#8b5cf6',
      [TaskStatus.TESTING]: '#f59e0b',
      [TaskStatus.REVIEW]: '#f59e0b',
      [TaskStatus.REVIEWING]: '#f59e0b',
      [TaskStatus.CHANGES_REQUESTED]: '#ef4444',
      [TaskStatus.APPROVED]: '#10b981',
      [TaskStatus.MERGED]: '#10b981',
      [TaskStatus.BLOCKED]: '#ef4444',
      [TaskStatus.CANCELLED]: '#6b7280',
    };
    return colorMap[status];
  }

  getTaskStatusLabel(status: TaskStatus): string {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
