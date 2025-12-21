import type { WorkersData } from '@shared';

import { workersApi } from './workers.api';

/**
 * ===========================================================================================
 * WORKERS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workers.
 * Responsibilities:
 * - Call API endpoints
 * - Transform data if needed
 * - Handle errors
 *
 * Does NOT contain:
 * - React hooks (in useWorkers)
 * - UI components
 *
 * ===========================================================================================
 */

export class WorkersService {
	/**
	 * Get all workers
	 */
	async getWorkers(): Promise<WorkersData> {
		return workersApi.getWorkers();
	}
}

// Export singleton instance
export const workersService = new WorkersService();
