import { createTypedFetch } from '@framework/api/api-base';
import type { WorkerFlows } from '@shared/api/flows.contract';
import { WORKERS_API_ROUTES } from '@shared/api/workers.contract';
import type { WorkersData, WorkersListQuery, WorkersListResponse } from '@shared/api/workers.contract';

/**
 * ===========================================================================================
 * WORKERS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for workers endpoints.
 * Generated from the WORKERS_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(WORKERS_API_ROUTES);

export const workersApi = {
	getWorkers: (): Promise<WorkersData> => {
		return typedFetch('GET', '/api/workers/', {}) as Promise<WorkersData>;
	},

	/**
	 * Get workers list with pagination support (new Data2 architecture)
	 */
	getWorkersList: (query: WorkersListQuery): Promise<WorkersListResponse> => {
		return typedFetch('GET', '/api/workers/', { query }) as Promise<WorkersListResponse>;
	},

	getWorkerFlows: (workerId: string): Promise<WorkerFlows> => {
		return typedFetch('GET', '/api/workers/:workerId/flows', { params: { workerId } });
	},
} as const;
