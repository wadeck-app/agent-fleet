// @ts-nocheck - Example code, not compiled
// Custom Hook Pattern - Exposes service functionality to components
// Pure presentation components consume hooks via props
import * as React from 'react';

import { taskService } from './task-service';
import { TaskViewModel } from './types';

/**
 * useTasks - Custom hook exposing task functionality
 * - Manages loading/error states
 * - Provides data and actions to components
 * - Components never call service directly
 */
export function useTasks() {
	const [tasks, setTasks] = React.useState<TaskViewModel[]>([]);
	const [isLoading, setIsLoading] = React.useState(true);
	const [error, setError] = React.useState<Error | null>(null);

	// Fetch tasks on mount
	React.useEffect(() => {
		loadTasks();
	}, []);

	const loadTasks = async () => {
		try {
			setIsLoading(true);
			setError(null);
			const data = await taskService.getTasks();
			setTasks(data);
		} catch (err) {
			setError(err as Error);
		} finally {
			setIsLoading(false);
		}
	};

	const updateTaskStatus = async (id: string, status: string) => {
		try {
			const updated = await taskService.completeTask(id);
			setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
		} catch (err) {
			setError(err as Error);
		}
	};

	const deleteTask = async (id: string) => {
		try {
			await taskService.deleteTask(id);
			setTasks(prev => prev.filter(t => t.id !== id));
		} catch (err) {
			setError(err as Error);
		}
	};

	return {
		tasks,
		isLoading,
		error,
		updateTaskStatus,
		deleteTask,
		reload: loadTasks,
	};
}
