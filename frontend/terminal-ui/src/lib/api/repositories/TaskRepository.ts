/**
 * TaskRepository - Data access layer for Task entities
 * Abstracts the data source (MockDataService or real API)
 */

import { Task, CreateTaskDTO } from '@/types/domain';
import { mockDataService } from '@/mock/MockDataService';

export class TaskRepository {
  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    // Currently using MockDataService
    // In production: apiClient.get<Task[]>('/tasks')
    return Promise.resolve(mockDataService.getTasks());
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskDTO): Promise<Task> {
    // Currently using MockDataService
    // In production: apiClient.post<Task>('/tasks', data)
    return Promise.resolve(mockDataService.addTask(data));
  }

  /**
   * Subscribe to task updates
   * Returns an unsubscribe function
   */
  subscribeToTasks(callback: (tasks: Task[]) => void): () => void {
    // Currently using MockDataService's subscription mechanism
    // In production, this might use WebSocket or SSE
    return mockDataService.subscribeToTasks(callback);
  }
}

export const taskRepository = new TaskRepository();
