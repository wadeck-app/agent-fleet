import { createTypedFetch } from '@framework/api/api-base';
import { TASKS_API_ROUTES } from '@shared/api/tasks.contract';
import type {
	CreateTask,
	PaginatedLogsQuery,
	PaginatedLogsResponse,
	Task,
	TaskStatus,
	TasksData,
	TasksListQuery,
	TasksListResponse,
	TasksQuery,
} from '@shared/api/tasks.contract';
import type { BulkDeleteResponse } from '@shared/common/api-helpers';

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

	/**
	 * Get a single task by ID with full flowResult including trace
	 */
	getTaskById: (id: string): Promise<Task> => {
		return typedFetch('GET', '/api/tasks/:id', { params: { id } });
	},

	/**
	 * Get paginated logs for a task
	 */
	getTaskLogs: (id: string, query: PaginatedLogsQuery): Promise<PaginatedLogsResponse> => {
		return typedFetch('GET', '/api/tasks/:id/logs', { params: { id }, query });
	},

	createTask: (body: CreateTask): Promise<Task> => {
		return typedFetch('POST', '/api/tasks/', { body });
	},

	deleteTask: (id: string): Promise<{ success: boolean }> => {
		return typedFetch('DELETE', '/api/tasks/:id', { params: { id } });
	},

	bulkDeleteTasks: (ids: string[]): Promise<BulkDeleteResponse> => {
		return typedFetch('DELETE', '/api/tasks/', { body: { ids } }) as Promise<BulkDeleteResponse>;
	},

	/**
	 * Update task status
	 */
	updateTaskStatus: (id: string, status: TaskStatus): Promise<Task> => {
		return typedFetch('PATCH', '/api/tasks/:id', { params: { id }, body: { status } });
	},
} as const;
