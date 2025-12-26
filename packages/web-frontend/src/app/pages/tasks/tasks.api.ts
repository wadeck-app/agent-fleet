import { createTypedFetch } from '@framework/api/api-base';
import { TASKS_API_ROUTES } from '@shared/api/tasks.contract';
import type {
	CreateTask,
	Task,
	TasksData,
	TasksListQuery,
	TasksListResponse,
	TasksQuery,
} from '@shared/api/tasks.contract';

/**
 * ===========================================================================================
 * TASKS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for tasks endpoints.
 * Generated from the TASKS_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(TASKS_API_ROUTES);

export const tasksApi = {
	getTasks: (query?: TasksQuery): Promise<TasksData> => {
		return typedFetch('GET', '/api/tasks/', { query: query || {} }) as Promise<TasksData>;
	},

	/**
	 * Get tasks list with pagination support (new Data2 architecture)
	 */
	getTasksList: (query: TasksListQuery): Promise<TasksListResponse> => {
		return typedFetch('GET', '/api/tasks/', { query }) as Promise<TasksListResponse>;
	},

	createTask: (body: CreateTask): Promise<Task> => {
		return typedFetch('POST', '/api/tasks/', { body });
	},

	deleteTask: (id: string): Promise<{ success: boolean }> => {
		return typedFetch('DELETE', '/api/tasks/:id', { params: { id } });
	},
} as const;
