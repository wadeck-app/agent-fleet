import { createTypedFetch } from '@framework/api/api-base';
import type { TasksData, TasksQuery } from '@shared';
import { TASKS_API_ROUTES } from '@shared';

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
		return typedFetch('GET', '/api/tasks/', { query: query || {} });
	},
} as const;
