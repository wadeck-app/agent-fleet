import type { WorkersData } from '@shared';
import { WORKERS_API_ROUTES } from '@shared';

import { createTypedFetch } from '@framework/api/api-base';

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
		return typedFetch('GET', '/api/workers/', {});
	},
} as const;
