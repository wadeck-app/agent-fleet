/**
 * Custom hook for task management
 * Exposes task service functionality to components
 */

import { useState, useEffect, useCallback } from 'react';
import { Task, TaskStatus } from '@/types/domain';
import { TaskService } from '../api/services/TaskService';
import { TaskRepository, CreateTaskDTO } from '../api/repositories/TaskRepository';

const taskRepository = new TaskRepository();
const taskService = new TaskService(taskRepository);

export interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createTask: (data: CreateTaskDTO) => Promise<Task>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  getTaskStatusColor: (status: TaskStatus) => string;
  getTaskStatusLabel: (status: TaskStatus) => string;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await taskService.getAllTasks();
      setTasks(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = useCallback(
    async (data: CreateTaskDTO): Promise<Task> => {
      const newTask = await taskService.createTask(data);
      await fetchTasks();
      return newTask;
    },
    [fetchTasks]
  );

  const updateTaskStatus = useCallback(
    async (id: string, status: TaskStatus): Promise<void> => {
      await taskService.updateTaskStatus(id, status);
      await fetchTasks();
    },
    [fetchTasks]
  );

  const deleteTask = useCallback(
    async (id: string): Promise<void> => {
      await taskService.deleteTask(id);
      await fetchTasks();
    },
    [fetchTasks]
  );

  return {
    tasks,
    loading,
    error,
    refetch: fetchTasks,
    createTask,
    updateTaskStatus,
    deleteTask,
    getTaskStatusColor: taskService.getTaskStatusColor.bind(taskService),
    getTaskStatusLabel: taskService.getTaskStatusLabel.bind(taskService),
  };
}
