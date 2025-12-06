/**
 * Task data access layer
 * Handles all task-related API calls
 */

import { Task, TaskStatus } from '@/types/domain';
import { mockTasks } from '@/lib/mock/mockData';

export interface CreateTaskDTO {
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
  flowId?: string;
  flowInputs?: Record<string, unknown>;
  workspacePath?: string;
}

export interface AddCommentDTO {
  author: string;
  content: string;
}

// In-memory task store for mock mode
let tasks = [...mockTasks];

export class TaskRepository {
  async getAllTasks(): Promise<Task[]> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<Task[]>('/tasks');
    return Promise.resolve([...tasks]);
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return Promise.resolve(tasks.filter(task => task.status === status));
  }

  async getTaskById(id: string): Promise<Task> {
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    return Promise.resolve(task);
  }

  async createTask(data: CreateTaskDTO): Promise<Task> {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      description: data.description,
      status: TaskStatus.TODO,
      priority: data.priority || 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: null,
      comments: [],
      metadata: data.metadata || {},
      history: [],
      flowId: data.flowId,
      flowInputs: data.flowInputs,
      workspacePath: data.workspacePath,
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

  async addComment(id: string, comment: AddCommentDTO): Promise<Task> {
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.comments.push({
      ...comment,
      timestamp: new Date().toISOString(),
    });
    return Promise.resolve(task);
  }

  async deleteTask(id: string): Promise<void> {
    tasks = tasks.filter(t => t.id !== id);
    return Promise.resolve();
  }

  async clearAllTasks(): Promise<{ message: string }> {
    tasks = [];
    return Promise.resolve({ message: 'All tasks cleared' });
  }

  async getTaskTrace(id: string): Promise<unknown> {
    return Promise.resolve({ trace: 'Mock trace data' });
  }
}
