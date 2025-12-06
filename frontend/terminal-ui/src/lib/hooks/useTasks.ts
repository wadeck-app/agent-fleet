/**
 * useTasks - Custom hook for task data
 * Exposes task service functionality to React components
 */

import { useState, useEffect, useCallback } from 'react';
import { Task, CreateTaskDTO } from '@/types/domain';
import { taskService } from '../api/services/TaskService';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch tasks on mount
  useEffect(() => {
    let isMounted = true;

    const fetchTasks = async () => {
      try {
        setLoading(true);
        const data = await taskService.getAllTasks();
        if (isMounted) {
          setTasks(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTasks();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to task updates
  useEffect(() => {
    const unsubscribe = taskService.subscribeToTasks((updatedTasks) => {
      setTasks(updatedTasks);
    });

    return unsubscribe;
  }, []);

  // Create a new task
  const createTask = useCallback(async (data: CreateTaskDTO) => {
    try {
      const newTask = await taskService.createTask(data);
      setTasks((prev) => [...prev, newTask]);
      return newTask;
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  // Get tasks by status
  const getTasksByStatus = useCallback(
    (status: Task['status']) => {
      return tasks.filter((t) => t.status === status);
    },
    [tasks]
  );

  // Get active tasks
  const getActiveTasks = useCallback(() => {
    return tasks.filter((t) => t.status === 'running' || t.status === 'queued');
  }, [tasks]);

  return {
    tasks,
    loading,
    error,
    createTask,
    getTasksByStatus,
    getActiveTasks,
    // Service helper methods
    getTaskStatusLabel: taskService.getTaskStatusLabel,
    getTaskStatusColor: taskService.getTaskStatusColor,
    getTaskTypeLabel: taskService.getTaskTypeLabel,
    formatTaskDuration: taskService.formatTaskDuration,
    isTaskActive: taskService.isTaskActive,
    isTaskCompleted: taskService.isTaskCompleted,
  };
}
