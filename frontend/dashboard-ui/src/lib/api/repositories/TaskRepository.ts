/**
 * Task data access layer
 * Handles all task-related API calls
 */

import { Task, TaskStatus, Priority } from '../../../types';
import { mockTasks } from '../../../data/mockData';

export interface CreateTaskDTO {
  description: string;
  priority: Priority;
  flowId?: string;
  workspacePath?: string;
}

// In-memory task store for mock mode
let tasks = [...mockTasks];

export class TaskRepository {
  async getAllTasks(): Promise<Task[]> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<Task[]>('/tasks');
    return Promise.resolve([...tasks]);
  }

  async getTaskById(id: string): Promise<Task> {
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    return Promise.resolve(task);
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return Promise.resolve(tasks.filter(task => task.status === status));
  }

  async createTask(data: CreateTaskDTO): Promise<Task> {
    const newTask: Task = {
      id: `task-${String(tasks.length + 1).padStart(3, '0')}`,
      description: data.description,
      status: TaskStatus.TODO,
      priority: data.priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: null,
      flowId: data.flowId,
      workspacePath: data.workspacePath
    };
    tasks.push(newTask);
    return Promise.resolve(newTask);
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    return Promise.resolve(task);
  }

  async deleteTask(id: string): Promise<void> {
    tasks = tasks.filter(t => t.id !== id);
    return Promise.resolve();
  }
}
